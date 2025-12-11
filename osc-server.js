/**
 * OSC WebSocket Server
 * OSCメッセージを受信してWebSocket経由でブラウザに転送
 * スクリーンショット保存機能も提供
 */

import OSC from 'osc-js';
import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OSC_PORT = 30337;  // Processingと同じポート
const WS_PORT = 8080;    // WebSocketサーバーのポート
const HTTP_PORT = 3001;  // HTTPサーバーのポート（Viteが3000を使用するため3001に変更）

// screenshotsフォルダを作成（存在しない場合）
const screenshotsDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
    console.log(`screenshotsフォルダを作成: ${screenshotsDir}`);
}

// WebSocketサーバーを起動
const wss = new WebSocketServer({ port: WS_PORT });

console.log(`WebSocketサーバー起動: ws://localhost:${WS_PORT}`);

// OSC受信を設定
const osc = new OSC({
    plugin: new OSC.DatagramPlugin({
        open: {
            host: '0.0.0.0',
            port: OSC_PORT
        }
    })
});

// OSCメッセージ受信時のハンドラー
osc.on('*', (message) => {
    // メッセージをパース
    const parsed = {
        address: message.address,
        args: message.args || [],
        trackNumber: null
    };
    
    // トラック番号を抽出
    const trackMatch = message.address.match(/\/track\/(\d+)/);
    if (trackMatch) {
        parsed.trackNumber = parseInt(trackMatch[1]);
    }
    
    // 全クライアントに送信
    wss.clients.forEach((client) => {
        if (client.readyState === 1) {  // WebSocket.OPEN = 1
            client.send(JSON.stringify(parsed));
        }
    });
    
    console.log('OSC受信:', parsed);
});

// OSC接続開始
osc.on('open', () => {
    console.log(`OSC受信開始: ポート ${OSC_PORT}`);
});

osc.on('error', (error) => {
    console.error('OSC Error:', error);
});

osc.open();

// WebSocket接続時のハンドラー
wss.on('connection', (ws) => {
    console.log('WebSocketクライアント接続');
    
    ws.on('close', () => {
        console.log('WebSocketクライアント切断');
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket Error:', error);
    });
});

// HTTPサーバーを起動（スクリーンショット保存用）
const httpServer = http.createServer((req, res) => {
    // CORSヘッダーを設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (req.method === 'POST' && req.url === '/api/save-texture') {
        console.log('🖼️ テクスチャ保存リクエスト受信');
        let body = '';
        
        req.on('data', (chunk) => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { filename, imageData, path: texturePath } = data;
                
                if (!filename || !imageData) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'filename and imageData are required' }));
                    return;
                }
                
                // Base64データをデコード
                const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                
                // 保存先ディレクトリを決定（pathが指定されている場合はpublic配下）
                let saveDir;
                if (texturePath) {
                    saveDir = path.join(__dirname, 'public', texturePath);
                } else {
                    saveDir = path.join(__dirname, 'public', 'textures');
                }
                
                // ディレクトリが存在しない場合は作成
                if (!fs.existsSync(saveDir)) {
                    fs.mkdirSync(saveDir, { recursive: true });
                    console.log(`テクスチャ保存ディレクトリを作成: ${saveDir}`);
                }
                
                // ファイルパスを作成
                const filePath = path.join(saveDir, filename);
                
                // ファイルを保存
                fs.writeFileSync(filePath, buffer);
                
                console.log(`✅ テクスチャ保存成功: ${filePath}`);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, path: filePath }));
            } catch (error) {
                console.error('❌ テクスチャ保存エラー:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else if (req.method === 'POST' && req.url === '/api/screenshot') {
        console.log('📸 スクリーンショットリクエスト受信');
        let body = '';
        
        req.on('data', (chunk) => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                console.log('リクエストボディサイズ:', body.length, 'bytes');
                console.log('リクエストボディの最初の200文字:', body.substring(0, 200));
                
                if (!body || body.length === 0) {
                    console.error('❌ リクエストボディが空です');
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Request body is empty' }));
                    return;
                }
                
                let data;
                try {
                    data = JSON.parse(body);
                } catch (parseError) {
                    console.error('❌ JSONパースエラー:', parseError);
                    console.error('ボディ内容:', body.substring(0, 500));
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON: ' + parseError.message }));
                    return;
                }
                
                const { filename, imageData } = data;
                
                console.log('パース後のデータ:');
                console.log('  filename:', filename, '(型:', typeof filename, ')');
                console.log('  imageData:', imageData ? (imageData.length + ' bytes, 型: ' + typeof imageData) : 'null');
                console.log('  filename存在チェック:', !!filename);
                console.log('  imageData存在チェック:', !!imageData);
                
                if (!filename || !imageData) {
                    console.error('❌ 必須パラメータが不足しています');
                    console.error('  filename:', filename);
                    console.error('  imageData:', imageData ? '存在' : 'null/undefined');
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'filename and imageData are required' }));
                    return;
                }
                
                // Base64データをデコード
                const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
                console.log('Base64データサイズ:', base64Data.length, 'bytes');
                const buffer = Buffer.from(base64Data, 'base64');
                console.log('Bufferサイズ:', buffer.length, 'bytes');
                
                // ファイルパスを作成
                const filePath = path.join(screenshotsDir, filename);
                console.log('保存先パス:', filePath);
                
                // ファイルを保存
                fs.writeFileSync(filePath, buffer);
                
                console.log(`✅ スクリーンショット保存成功: ${filePath}`);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, path: filePath }));
            } catch (error) {
                console.error('❌ スクリーンショット保存エラー:', error);
                console.error('エラー詳細:', error.stack);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
});

httpServer.listen(HTTP_PORT, () => {
    console.log(`HTTPサーバー起動: http://localhost:${HTTP_PORT}`);
});

console.log('OSC WebSocket Server 起動完了');
console.log(`OSC受信ポート: ${OSC_PORT}`);
console.log(`WebSocketポート: ${WS_PORT}`);
console.log(`HTTPポート: ${HTTP_PORT}`);
console.log(`スクリーンショット保存先: ${screenshotsDir}`);

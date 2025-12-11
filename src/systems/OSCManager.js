/**
 * OSC通信管理クラス
 * WebSocket経由でOSCメッセージを受信
 */

export class OSCManager {
    constructor(options = {}) {
        this.wsUrl = options.wsUrl || 'ws://localhost:8080';
        this.onMessage = options.onMessage || null;
        this.onStatusChange = options.onStatusChange || null;
        
        this.ws = null;
        this.isConnected = false;
        
        this.init();
    }
    
    init() {
        try {
            // WebSocket接続
            this.ws = new WebSocket(this.wsUrl);
            
            // 接続成功
            this.ws.onopen = () => {
                this.isConnected = true;
                if (this.onStatusChange) {
                    this.onStatusChange('Connected');
                }
                console.log(`OSC: WebSocket接続成功 (${this.wsUrl})`);
            };
            
            // メッセージ受信
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('OSCメッセージパースエラー:', error);
                }
            };
            
            // 接続終了
            this.ws.onclose = () => {
                this.isConnected = false;
                if (this.onStatusChange) {
                    this.onStatusChange('Disconnected');
                }
                console.log('OSC: WebSocket接続終了');
                
                // 再接続を試みる（5秒後）
                setTimeout(() => {
                    console.log('OSC: 再接続を試みます...');
                    this.init();
                }, 5000);
            };
            
            // エラーハンドリング
            this.ws.onerror = (error) => {
                console.error('OSC WebSocket Error:', error);
                if (this.onStatusChange) {
                    this.onStatusChange('Error');
                }
                console.log('OSC: WebSocketサーバーに接続できません。');
                console.log('OSC: 別ターミナルで "npm run osc-server" を実行してください。');
            };
            
        } catch (error) {
            console.error('OSC初期化エラー:', error);
            if (this.onStatusChange) {
                this.onStatusChange('Error');
            }
        }
    }
    
    handleMessage(message) {
        // メッセージは既にパース済み（JSON形式）
        // コールバックを呼び出し
        if (this.onMessage) {
            this.onMessage(message);
        }
    }
    
    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}


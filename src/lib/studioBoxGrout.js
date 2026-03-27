/**
 * 目地・床マーキング（StudioBox / LabGrunge / ConcretePBR 共通）
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} size
 * @param {{ divisions?: number, strokeStyle?: string, lineWidth?: number }} [options]
 */
export function drawGroutLines(ctx, size, options = {}) {
    const divisions = options.divisions ?? 50;
    const step = size / divisions;
    ctx.strokeStyle = options.strokeStyle ?? '#808080';
    ctx.lineWidth = options.lineWidth ?? 0.5;
    ctx.beginPath();
    for (let i = 0; i <= divisions; i++) {
        ctx.moveTo(i * step, 0);
        ctx.lineTo(i * step, size);
        ctx.moveTo(0, i * step);
        ctx.lineTo(size, i * step);
    }
    ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} size
 * @param {number} [divisions=50]
 */
export function drawRedCrossesAndLabels(ctx, size, divisions = 50) {
    const scale = size / 2048;
    const step = size / divisions;
    const labelMax = 256;
    const centerIdx = divisions / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontPx = Math.max(5, Math.round(8 * scale));
    ctx.font = `500 ${fontPx}px "Inter", "Roboto", sans-serif`;
    const cs = 5 * scale;
    const textOff = 12 * scale;
    const lineW = Math.max(0.5, 1.0 * scale);

    for (let i = 0; i <= divisions; i += 2) {
        const tx = i * step;
        const tyCenter = centerIdx * step;
        const labelVal = Math.abs((i - centerIdx) * (labelMax / centerIdx));

        ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
        ctx.lineWidth = lineW;

        ctx.beginPath();
        ctx.moveTo(tx - cs, tyCenter);
        ctx.lineTo(tx + cs, tyCenter);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx, tyCenter - cs);
        ctx.lineTo(tx, tyCenter + cs);
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillText(String(Math.round(labelVal)), tx, tyCenter + textOff);

        const tz = i * step;
        const txCenter = centerIdx * step;

        if (i !== centerIdx) {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
            ctx.beginPath();
            ctx.moveTo(txCenter - cs, tz);
            ctx.lineTo(txCenter + cs, tz);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(txCenter, tz - cs);
            ctx.lineTo(txCenter, tz + cs);
            ctx.stroke();
            ctx.fillText(String(Math.round(labelVal)), txCenter + textOff, tz);
        }
    }
}

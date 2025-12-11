varying vec3 vColor;

void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));
    if (dist > 0.5) discard;
    // 不透明度100%（完全に不透明）
    gl_FragColor = vec4(vColor, 1.0);
}

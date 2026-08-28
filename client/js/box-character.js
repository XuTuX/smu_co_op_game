/** Shared face-box renderer used by obstacle dodge and timing jump. */
(function registerDodgeBoxCharacter(global) {
  function drawDodgeBoxCharacter(ctx, options) {
    const {
      x,
      y,
      width = 68,
      height = 68,
      topColor = '#ffe77d',
      frontColor = '#ffd84d',
      sideColor = '#d9a900',
      mouthColor = '#ff6b35',
      outlineColor = '#28231f',
      drawShadow = true,
      expression = 'neutral'
    } = options;
    const scale = Math.min(width, height) / 68;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (drawShadow) {
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath();
      ctx.ellipse(5, 32, 31, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';

    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.moveTo(-28, -24);
    ctx.lineTo(-18, -34);
    ctx.lineTo(34, -34);
    ctx.lineTo(26, -24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = sideColor;
    ctx.beginPath();
    ctx.moveTo(26, -24);
    ctx.lineTo(34, -34);
    ctx.lineTo(34, 18);
    ctx.lineTo(26, 28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = frontColor;
    ctx.fillRect(-28, -24, 54, 52);
    ctx.strokeRect(-28, -24, 54, 52);

    ctx.strokeStyle = outlineColor;
    ctx.fillStyle = outlineColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    if (expression === 'hit') {
      ctx.beginPath();
      ctx.moveTo(-17, -12); ctx.lineTo(-7, -3);
      ctx.moveTo(-7, -12); ctx.lineTo(-17, -3);
      ctx.moveTo(7, -12); ctx.lineTo(17, -3);
      ctx.moveTo(17, -12); ctx.lineTo(7, -3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-10, 10); ctx.lineTo(-5, 5); ctx.lineTo(0, 10); ctx.lineTo(5, 5); ctx.lineTo(10, 10);
      ctx.stroke();
    } else if (expression === 'happy') {
      ctx.beginPath();
      ctx.arc(-12, -5, 6, Math.PI, Math.PI * 2);
      ctx.arc(12, -5, 6, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 2, 11, 0.18, Math.PI - 0.18);
      ctx.stroke();
    } else if (expression === 'jump') {
      ctx.fillRect(-16, -13, 8, 13);
      ctx.fillRect(8, -13, 8, 13);
      ctx.fillStyle = mouthColor;
      ctx.beginPath();
      ctx.ellipse(0, 8, 7, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(-15, -10, 7, 8);
      ctx.fillRect(8, -10, 7, 8);
      ctx.fillStyle = mouthColor;
      ctx.fillRect(-8, 2, 16, 9);
      ctx.strokeRect(-8, 2, 16, 9);
    }
    ctx.restore();
  }

  global.drawDodgeBoxCharacter = drawDodgeBoxCharacter;
})(window);

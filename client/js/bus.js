/**
 * Bus Entity and Kinematic Vehicle Physics
 */
class Bus {
  constructor(x, y, angle = 0) {
    this.x = x;
    this.y = y;
    this.angle = angle; // Radians (0 = pointing right)
    this.speed = 0;
    this.steeringAngle = 0; // Current front wheel angle in radians

    this.width = CONFIG.BUS.WIDTH;
    this.length = CONFIG.BUS.LENGTH;
    this.wheelbase = CONFIG.BUS.WHEELBASE;

    // Previous position for collision rollback
    this.prevX = x;
    this.prevY = y;
    this.prevAngle = angle;
    this.prevSpeed = 0;

    // Visual indicators
    this.isBraking = false;
    this.isReversing = false;

    // Skid marks tracking
    this.skidMarks = [];
  }

  reset(x, y, angle = 0) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = 0;
    this.steeringAngle = 0;
    this.prevX = x;
    this.prevY = y;
    this.prevAngle = angle;
    this.prevSpeed = 0;
    this.isBraking = false;
    this.isReversing = false;
    this.skidMarks = [];
  }

  update(inputs) {
    // Save state before update for collision resolution
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevAngle = this.angle;
    this.prevSpeed = this.speed;

    const b = CONFIG.BUS;

    // 1. Steering Logic
    if (inputs.left && !inputs.right) {
      this.steeringAngle = Math.max(-b.MAX_STEER_ANGLE, this.steeringAngle - b.STEER_SPEED);
    } else if (inputs.right && !inputs.left) {
      this.steeringAngle = Math.min(b.MAX_STEER_ANGLE, this.steeringAngle + b.STEER_SPEED);
    } else {
      // Auto-center steering when released
      if (Math.abs(this.steeringAngle) < b.STEER_RETURN_SPEED) {
        this.steeringAngle = 0;
      } else if (this.steeringAngle > 0) {
        this.steeringAngle -= b.STEER_RETURN_SPEED;
      } else {
        this.steeringAngle += b.STEER_RETURN_SPEED;
      }
    }

    // 2. Acceleration & Braking Logic
    this.isBraking = false;
    this.isReversing = false;

    if (inputs.forward && !inputs.backward) {
      if (this.speed >= 0) {
        this.speed = Math.min(b.MAX_SPEED, this.speed + b.ACCELERATION);
      } else {
        // Braking while in reverse
        this.isBraking = true;
        this.speed = Math.min(0, this.speed + b.DECELERATION);
      }
    } else if (inputs.backward && !inputs.forward) {
      if (this.speed <= 0) {
        this.speed = Math.max(b.MAX_REVERSE_SPEED, this.speed - b.REVERSE_ACCEL);
        this.isReversing = true;
      } else {
        // Braking while going forward
        this.isBraking = true;
        this.speed = Math.max(0, this.speed - b.DECELERATION);
      }
    } else {
      // Natural rolling friction / coasting
      if (Math.abs(this.speed) < b.NATURAL_FRICTION) {
        this.speed = 0;
      } else if (this.speed > 0) {
        this.speed -= b.NATURAL_FRICTION;
      } else {
        this.speed += b.NATURAL_FRICTION;
      }
    }

    // 3. Kinematic Bicycle Model
    if (Math.abs(this.speed) > 0.001) {
      // Angular velocity omega = (speed / wheelbase) * tan(steeringAngle)
      const omega = (this.speed / this.wheelbase) * Math.tan(this.steeringAngle);
      this.angle += omega;

      // Normalize angle to [-PI, PI]
      this.angle = Math.atan2(Math.sin(this.angle), Math.cos(this.angle));

      // Translate position
      this.x += this.speed * Math.cos(this.angle);
      this.y += this.speed * Math.sin(this.angle);
    }
  }

  // Rollback on hard collision
  rollback(reboundFactor = 0.3) {
    this.x = this.prevX;
    this.y = this.prevY;
    this.angle = this.prevAngle;
    this.speed = -this.prevSpeed * reboundFactor; // Bounce slightly
  }

  // Get current 4 corners of Oriented Bounding Box (OBB)
  getCorners() {
    const halfL = this.length / 2;
    const halfW = this.width / 2;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);

    const fX = cos * halfL;
    const fY = sin * halfL;
    const sX = -sin * halfW;
    const sY = cos * halfW;

    return [
      { x: this.x + fX + sX, y: this.y + fY + sY }, // Front Left
      { x: this.x + fX - sX, y: this.y + fY - sY }, // Front Right
      { x: this.x - fX - sX, y: this.y - fY - sY }, // Rear Right
      { x: this.x - fX + sX, y: this.y - fY + sY }  // Rear Left
    ];
  }

  // Draw bus and all detailed elements on canvas
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const halfL = this.length / 2;
    const halfW = this.width / 2;
    const wheelDist = this.wheelbase / 2;

    // 1. Bus Shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.roundRect(-halfL + 5, -halfW + 5, this.length, this.width, 8);
    ctx.fill();
    ctx.restore();

    // 2. Wheels
    this.drawWheels(ctx, halfL, halfW, wheelDist);

    // 3. Main Bus Body (Yellow Arcade School / City Bus)
    ctx.fillStyle = '#FBBF24'; // Vibrant Amber Yellow
    ctx.strokeStyle = '#D97706';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-halfL, -halfW, this.length, this.width, 8);
    ctx.fill();
    ctx.stroke();

    // 4. Black Side Accent Stripes
    ctx.fillStyle = '#1F2937';
    ctx.fillRect(-halfL + 12, -halfW + 1, this.length - 24, 3);
    ctx.fillRect(-halfL + 12, halfW - 4, this.length - 24, 3);

    // 5. White Roof Section
    ctx.fillStyle = '#F3F4F6';
    ctx.beginPath();
    ctx.roundRect(-halfL + 18, -halfW + 6, this.length - 42, this.width - 12, 4);
    ctx.fill();

    // Roof A/C Unit & Vent
    ctx.fillStyle = '#9CA3AF';
    ctx.fillRect(-10, -halfW + 10, 20, this.width - 20);
    ctx.fillStyle = '#6B7280';
    ctx.fillRect(-6, -halfW + 13, 12, this.width - 26);

    // 6. Windows
    // Front Windshield (curved dark glass)
    ctx.fillStyle = '#1E3A8A';
    ctx.strokeStyle = '#172554';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(halfL - 26, -halfW + 5, 14, this.width - 10, [2, 6, 6, 2]);
    ctx.fill();
    ctx.stroke();

    // Rear Window
    ctx.beginPath();
    ctx.roundRect(-halfL + 5, -halfW + 6, 8, this.width - 12, 2);
    ctx.fill();
    ctx.stroke();

    // Side Windows
    const winCount = 4;
    const winW = 10;
    const winH = 4;
    const startX = -halfL + 20;
    for (let i = 0; i < winCount; i++) {
      const curX = startX + i * 14;
      // Top side window
      ctx.fillRect(curX, -halfW + 2, winW, winH);
      // Bottom side window
      ctx.fillRect(curX, halfW - 6, winW, winH);
    }

    // 7. Headlights (Front)
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(halfL - 4, -halfW + 4, 3, 7);
    ctx.fillRect(halfL - 4, halfW - 11, 3, 7);

    // Subtle Headlight Beams when moving forward
    if (this.speed > 0.5) {
      ctx.save();
      const beamGrad = ctx.createLinearGradient(halfL, 0, halfL + 60, 0);
      beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.4)');
      beamGrad.addColorStop(1, 'rgba(254, 240, 138, 0.0)');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(halfL, -halfW + 4);
      ctx.lineTo(halfL + 60, -halfW - 20);
      ctx.lineTo(halfL + 60, halfW + 20);
      ctx.lineTo(halfL, halfW - 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 8. Tail / Brake Lights (Rear)
    if (this.isBraking || this.isReversing) {
      ctx.fillStyle = '#EF4444'; // Bright Red
      ctx.shadowColor = '#EF4444';
      ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = '#7F1D1D'; // Dark Red idle
      ctx.shadowBlur = 0;
    }
    ctx.fillRect(-halfL, -halfW + 4, 3, 6);
    ctx.fillRect(-halfL, halfW - 10, 3, 6);
    ctx.shadowBlur = 0; // Reset shadow

    // 9. Side Mirrors
    ctx.fillStyle = '#1F2937';
    ctx.fillRect(halfL - 20, -halfW - 4, 6, 4);
    ctx.fillRect(halfL - 20, halfW, 6, 4);

    ctx.restore();
  }

  drawWheels(ctx, halfL, halfW, wheelDist) {
    const wheelW = 16;
    const wheelH = 6;

    // Front Wheels (Turned with steeringAngle)
    const frontX = wheelDist;
    const rearX = -wheelDist;

    // Front-Left Wheel
    ctx.save();
    ctx.translate(frontX, -halfW + 2);
    ctx.rotate(this.steeringAngle);
    ctx.fillStyle = '#111827';
    ctx.fillRect(-wheelW / 2, -wheelH / 2, wheelW, wheelH);
    ctx.fillStyle = '#6B7280';
    ctx.fillRect(-wheelW / 4, -wheelH / 4, wheelW / 2, wheelH / 2);
    ctx.restore();

    // Front-Right Wheel
    ctx.save();
    ctx.translate(frontX, halfW - 2);
    ctx.rotate(this.steeringAngle);
    ctx.fillStyle = '#111827';
    ctx.fillRect(-wheelW / 2, -wheelH / 2, wheelW, wheelH);
    ctx.fillStyle = '#6B7280';
    ctx.fillRect(-wheelW / 4, -wheelH / 4, wheelW / 2, wheelH / 2);
    ctx.restore();

    // Rear Wheels (Fixed straight)
    // Rear-Left Wheel
    ctx.fillStyle = '#111827';
    ctx.fillRect(rearX - wheelW / 2, -halfW - 1, wheelW, wheelH);
    // Rear-Right Wheel
    ctx.fillRect(rearX - wheelW / 2, halfW - 5, wheelW, wheelH);
  }
}

window.Bus = Bus;

/**
 * Parking Spot Judgment and Verification Engine
 */
class ParkingJudge {
  constructor() {
    this.currentSpot = null;
    this.dwellTimer = 0;
    this.isSuccessful = false;
    this.isLocked = false;
    this.pulseTime = 0;
    this.rules = {
      angleToleranceDeg: CONFIG.PARKING.ANGLE_TOLERANCE_DEG,
      maxStopSpeed: CONFIG.PARKING.MAX_STOP_SPEED,
      dwellTimeSec: CONFIG.PARKING.DWELL_TIME_SEC,
      cornerTolerance: CONFIG.PARKING.CORNER_INSIDE_TOLERANCE
    };

    // Status details for UI feedback
    this.status = {
      isInside: false,
      isAngleAligned: false,
      isStopped: false,
      angleDiffDeg: 0,
      progress: 0
    };
  }

  setTargetSpot(spot) {
    this.currentSpot = spot;
    this.dwellTimer = 0;
    this.isSuccessful = false;
    this.status.progress = 0;
  }

  setLocked(isLocked) {
    this.isLocked = Boolean(isLocked);
    if (this.isLocked) {
      this.dwellTimer = 0;
      this.status.progress = 0;
    }
  }

  setDifficulty(difficulty) {
    this.rules = {
      angleToleranceDeg: difficulty.angleToleranceDeg,
      maxStopSpeed: difficulty.maxStopSpeed,
      dwellTimeSec: difficulty.dwellTimeSec,
      cornerTolerance: difficulty.cornerTolerance
    };
    this.dwellTimer = 0;
    this.status.progress = 0;
  }

  // Normalize angle to [-PI, PI]
  normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  // Point in polygon test (Ray-casting algorithm)
  pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;

      const intersect = ((yi > point.y) !== (yj > point.y))
          && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Calculate polygon vertices of the parking spot with optional margin
  getSpotCorners(spot, margin = 0) {
    const halfL = (spot.length / 2) + margin;
    const halfW = (spot.width / 2) + margin;
    const cos = Math.cos(spot.angle);
    const sin = Math.sin(spot.angle);

    const fX = cos * halfL;
    const fY = sin * halfL;
    const sX = -sin * halfW;
    const sY = cos * halfW;

    return [
      { x: spot.x + fX + sX, y: spot.y + fY + sY },
      { x: spot.x + fX - sX, y: spot.y + fY - sY },
      { x: spot.x - fX - sX, y: spot.y - fY - sY },
      { x: spot.x - fX + sX, y: spot.y - fY + sY }
    ];
  }

  update(bus, deltaTime, onSuccess) {
    if (!this.currentSpot || this.isSuccessful || this.isLocked) return;

    this.pulseTime += deltaTime;

    const spotCorners = this.getSpotCorners(this.currentSpot, this.rules.cornerTolerance);
    const busCorners = bus.getCorners();

    // 1. Spatial Containment Check (Check if bus corners are inside the parking bay)
    let cornersInside = 0;
    for (const corner of busCorners) {
      if (this.pointInPolygon(corner, spotCorners)) {
        cornersInside++;
      }
    }
    // At least 4 of 4 corners (or center + 3 corners) inside
    const busCenter = { x: bus.x, y: bus.y };
    const centerInside = this.pointInPolygon(busCenter, spotCorners);
    const isInside = (cornersInside >= 4) || (cornersInside >= 3 && centerInside);

    // 2. Angular Alignment Check (±15 degrees from forward or reverse angle)
    const diff1 = Math.abs(this.normalizeAngle(bus.angle - this.currentSpot.angle));
    const diff2 = Math.abs(this.normalizeAngle(bus.angle - (this.currentSpot.angle + Math.PI)));
    const minDiffRad = Math.min(diff1, diff2);
    const angleDiffDeg = minDiffRad * (180 / Math.PI);
    const isAngleAligned = angleDiffDeg <= this.rules.angleToleranceDeg;

    // 3. Speed Check (Must be almost completely stopped)
    const isStopped = Math.abs(bus.speed) <= this.rules.maxStopSpeed;

    // Update status object
    this.status.isInside = isInside;
    this.status.isAngleAligned = isAngleAligned;
    this.status.isStopped = isStopped;
    this.status.angleDiffDeg = Math.round(angleDiffDeg);

    // 4. Dwell Time Integration
    if (isInside && isAngleAligned && isStopped) {
      this.dwellTimer += deltaTime;
      this.status.progress = Math.min(1.0, this.dwellTimer / this.rules.dwellTimeSec);

      if (this.dwellTimer >= this.rules.dwellTimeSec) {
        this.isSuccessful = true;
        this.status.progress = 1.0;
        if (onSuccess) {
          onSuccess(this.currentSpot);
        }
      }
    } else {
      this.dwellTimer = 0;
      this.status.progress = 0;
    }
  }

  draw(ctx, bus) {
    if (!this.currentSpot) return;

    const spot = this.currentSpot;
    ctx.save();
    ctx.translate(spot.x, spot.y);
    ctx.rotate(spot.angle);

    const halfL = spot.length / 2;
    const halfW = spot.width / 2;

    // 1. Pulsing glowing zone
    const pulse = 0.5 + 0.5 * Math.sin(this.pulseTime * 4);
    const glowAlpha = 0.2 + 0.2 * pulse;

    if (this.isLocked) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 4;
    } else if (this.status.progress > 0) {
      // Highlighting in active parking mode (Emerald Green)
      ctx.fillStyle = `rgba(16, 185, 129, ${0.3 + 0.3 * this.status.progress})`;
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 4;
    } else if (this.status.isInside) {
      // Partially in slot (Yellow/Orange)
      ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 3;
    } else {
      // Target standby (Neon Cyan)
      ctx.fillStyle = `rgba(6, 182, 212, ${glowAlpha})`;
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 3;
    }

    // Draw slot bounding box
    ctx.beginPath();
    ctx.roundRect(-halfL, -halfW, spot.length, spot.width, 6);
    ctx.fill();
    ctx.stroke();

    // A single upright parking symbol stays readable at every bay angle.
    ctx.save();
    ctx.rotate(-spot.angle);
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#172554';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#172554';
    ctx.font = '900 30px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', 0, 1);
    ctx.restore();

    if (this.isLocked) {
      ctx.save();
      ctx.fillStyle = '#FBBF24';
      ctx.strokeStyle = '#172554';
      ctx.lineWidth = 4;
      ctx.font = '900 20px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText('주차권 필요', spot.x, spot.y + 55);
      ctx.fillText('주차권 필요', spot.x, spot.y + 55);
      ctx.restore();
    }

    ctx.restore();

    // 2. Dwell Progress Ring around Bus if currently parking
    if (this.status.progress > 0 && bus) {
      ctx.save();
      ctx.translate(bus.x, bus.y);

      // Outer ring background
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0, Math.PI * 2);
      ctx.stroke();

      // Active progress arc
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 50, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * this.status.progress));
      ctx.stroke();

      // Text status
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`정지 유지 ${Math.round(this.status.progress * 100)}%`, 0, -65);

      ctx.restore();
    }
  }
}

window.ParkingJudge = ParkingJudge;

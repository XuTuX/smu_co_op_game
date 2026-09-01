/**
 * Map Layout, Obstacles, and Parking Spots
 */
class GameMap {
  constructor(width = 1200, height = 800) {
    this.width = width;
    this.height = height;

    // Outer boundary walls (thickness 20)
    this.walls = [
      { x: width / 2, y: 10, width: width, height: 20, type: 'wall' },             // Top
      { x: width / 2, y: height - 10, width: width, height: 20, type: 'wall' },      // Bottom
      { x: 10, y: height / 2, width: 20, height: height, type: 'wall' },             // Left
      { x: width - 10, y: height / 2, width: 20, height: height, type: 'wall' }      // Right
    ];

    // Every round uses the same lot. Only obstacles and the active bay change,
    // so a round advance feels like a quick screen transition rather than a
    // completely different stage.
    this.layout = {
      name: '무한 주차장',
      code: 'ENDLESS LOT',
      theme: { ground: '#202731', grid: '#28313D', accent: '#EAB308', wall: '#3A4654' },
      spawnPoint: { x: 600, y: 690, angle: -Math.PI / 2 },
      parkingSpots: [
        { id: 1, name: '중앙 정면 주차', x: 600, y: 135, angle: Math.PI / 2 },
        { id: 2, name: '우측 평행 주차', x: 1040, y: 400, angle: 0 },
        { id: 3, name: '좌측 정면 주차', x: 205, y: 135, angle: Math.PI / 2 },
        { id: 4, name: '좌측 평행 주차', x: 155, y: 400, angle: 0 },
        { id: 5, name: '우측 정면 주차', x: 995, y: 135, angle: Math.PI / 2 },
        { id: 6, name: '하단 좌측 주차', x: 205, y: 665, angle: Math.PI / 2 }
      ]
    };

    // Five large hazards leave a usable route while still making late rounds busy.
    this.maxObstacles = 5;
    this.obstacleSpawnPoints = [
      { x: 360, y: 300 }, { x: 820, y: 300 },
      { x: 360, y: 500 }, { x: 820, y: 500 },
      { x: 600, y: 400, movingOnly: true }
    ];
    this.staticObstacleTemplates = [
      { width: 138, height: 48, type: 'cone-row' },
      { width: 165, height: 42, type: 'concrete-block' },
      { width: 170, height: 62, type: 'workzone' },
      { width: 104, height: 54, type: 'tire-stack' },
      { width: 150, height: 50, type: 'barricade' }
    ];
    this.pickupSpawnPoints = [
      { x: 400, y: 135 }, { x: 800, y: 135 },
      { x: 400, y: 665 }, { x: 800, y: 665 },
      { x: 280, y: 235 }, { x: 920, y: 235 },
      { x: 280, y: 565 }, { x: 920, y: 565 }
    ];
    this.layoutSeed = Math.floor(Math.random() * 1000000);

    this.setRound(1);
  }

  getObstacleCountForRound(round) {
    return Math.min(this.maxObstacles, Math.max(0, Math.floor(round) - 2));
  }

  getMovingObstacleCountForRound(round) {
    const count = this.getObstacleCountForRound(round);
    return count >= 3 ? 1 : 0;
  }

  setRound(round) {
    const safeRound = Math.max(1, Math.floor(round));
    const layout = this.layout;
    this.round = safeRound;
    this.stage = 1;
    this.stageName = layout.name;
    this.stageCode = layout.code;
    this.theme = { ...layout.theme };
    this.spawnPoint = { ...layout.spawnPoint };
    this.parkingSpots = layout.parkingSpots.map((parkingSpot) => ({
      ...parkingSpot,
      width: CONFIG.PARKING_DIFFICULTY.spotWidth,
      length: CONFIG.PARKING_DIFFICULTY.spotLength
    }));
    this.layoutSeed = Math.floor(Math.random() * 1000000);
    this.obstacles = [];
    this.parkingPass = null;
    this.advanceRound(safeRound, this.spawnPoint.x, this.spawnPoint.y);
    this.activeParkingSpotId = this.parkingSpots[0].id;
  }

  randomUnit(key, salt = 0) {
    const value = Math.sin((this.layoutSeed + key * 9283 + salt * 2971) * 0.0174533) * 43758.5453;
    return value - Math.floor(value);
  }

  getObstacleBounds(obstacle) {
    const quarterTurn = Math.abs(Math.sin(obstacle.angle || 0)) > 0.7;
    const halfWidth = (quarterTurn ? obstacle.height : obstacle.width) / 2;
    const halfHeight = (quarterTurn ? obstacle.width : obstacle.height) / 2;
    let minX = obstacle.x - halfWidth;
    let maxX = obstacle.x + halfWidth;
    let minY = obstacle.y - halfHeight;
    let maxY = obstacle.y + halfHeight;
    if (obstacle.motion?.axis === 'x') {
      minX = obstacle.motion.min - halfWidth;
      maxX = obstacle.motion.max + halfWidth;
    } else if (obstacle.motion?.axis === 'y') {
      minY = obstacle.motion.min - halfHeight;
      maxY = obstacle.motion.max + halfHeight;
    }
    return { minX, maxX, minY, maxY };
  }

  boundsOverlap(a, b, gap = 0) {
    return !(a.maxX + gap <= b.minX || b.maxX + gap <= a.minX
      || a.maxY + gap <= b.minY || b.maxY + gap <= a.minY);
  }

  getParkingSpotBounds(spot) {
    return this.getObstacleBounds({
      x: spot.x,
      y: spot.y,
      width: spot.length,
      height: spot.width,
      angle: spot.angle,
      motion: null
    });
  }

  createObstacle(obstacleIndex, round, avoidX, avoidY) {
    const isMoving = obstacleIndex === 2;
    const isWall = obstacleIndex === 1 || obstacleIndex === 4;
    let spec;
    if (isMoving) {
      spec = {
        width: 94,
        height: 58,
        type: 'maintenance-cart',
        color: '#2563EB'
      };
    } else if (isWall) {
      spec = { width: 180, height: 36, type: 'wall-segment' };
    } else {
      const templateIndex = Math.floor(this.randomUnit(obstacleIndex, 3) * this.staticObstacleTemplates.length);
      spec = { ...this.staticObstacleTemplates[templateIndex] };
    }

    const angle = 0;
    const movingAxis = 'y';
    const makeCandidate = (point) => {
      const obstacle = { ...spec, x: point.x, y: point.y, angle, addedRound: round, motion: null };
      if (isMoving) {
        const center = point[movingAxis];
        obstacle.motion = {
          axis: movingAxis,
          min: center - 95,
          max: center + 95,
          baseSpeed: obstacleIndex === 2 ? 72 : 86,
          speed: obstacleIndex === 2 ? 72 : 86,
          direction: this.randomUnit(obstacleIndex, 23) > 0.5 ? 1 : -1
        };
      }
      return obstacle;
    };

    const eligiblePoints = this.obstacleSpawnPoints.filter((point) => isMoving ? point.movingOnly : !point.movingOnly);
    const orderedPoints = eligiblePoints
      .map((point, index) => ({ ...point, order: this.randomUnit(obstacleIndex + 1, index + 11) }))
      .sort((a, b) => a.order - b.order);
    const isClear = (point) => {
      const candidateBounds = this.getObstacleBounds(makeCandidate(point));
      if (avoidX !== undefined && avoidY !== undefined) {
        const busBounds = { minX: avoidX - 78, maxX: avoidX + 78, minY: avoidY - 78, maxY: avoidY + 78 };
        if (this.boundsOverlap(candidateBounds, busBounds, 45)) return false;
      }
      if (this.parkingSpots.some((spot) => this.boundsOverlap(candidateBounds, this.getParkingSpotBounds(spot), 24))) {
        return false;
      }
      return this.obstacles.every((obstacle) => !this.boundsOverlap(candidateBounds, this.getObstacleBounds(obstacle), 42));
    };
    const point = orderedPoints.find(isClear);
    return point ? makeCandidate(point) : null;
  }

  advanceRound(round, avoidX, avoidY) {
    const safeRound = Math.max(1, Math.floor(round));
    this.round = safeRound;
    const desiredCount = this.getObstacleCountForRound(safeRound);
    while (this.obstacles.length < desiredCount) {
      const obstacle = this.createObstacle(this.obstacles.length, safeRound, avoidX, avoidY);
      if (!obstacle) break;
      this.obstacles.push(obstacle);
    }
    const speedScale = 1 + Math.min(0.75, Math.max(0, safeRound - 5) * 0.025);
    for (const obstacle of this.obstacles) {
      if (obstacle.motion) obstacle.motion.speed = obstacle.motion.baseSpeed * speedScale;
    }
  }

  // Kept as a compatibility alias for diagnostics that initialize a map stage.
  setStage(level) {
    this.setRound(level);
  }

  setActiveParkingSpot(spot) {
    if (spot) this.activeParkingSpotId = spot.id;
  }

  spawnParkingPass(round, busX, busY, targetSpot) {
    const orderedPoints = this.pickupSpawnPoints
      .map((point, index) => ({ ...point, order: this.randomUnit(round, index + 47) }))
      .sort((a, b) => a.order - b.order);
    const point = orderedPoints.find((candidate) => {
      if (Math.hypot(candidate.x - busX, candidate.y - busY) < 155) return false;
      if (targetSpot && Math.hypot(candidate.x - targetSpot.x, candidate.y - targetSpot.y) < 150) return false;
      const pickupBounds = {
        minX: candidate.x - 25,
        maxX: candidate.x + 25,
        minY: candidate.y - 25,
        maxY: candidate.y + 25
      };
      return this.obstacles.every((obstacle) => !this.boundsOverlap(pickupBounds, this.getObstacleBounds(obstacle), 28));
    });
    this.parkingPass = point ? { x: point.x, y: point.y, radius: 24, pulse: 0 } : null;
    return this.parkingPass;
  }

  clearParkingPass() {
    this.parkingPass = null;
  }

  collectParkingPass(bus) {
    if (!this.parkingPass) return false;
    if (Math.hypot(bus.x - this.parkingPass.x, bus.y - this.parkingPass.y) > 62) return false;
    this.parkingPass = null;
    return true;
  }

  // Get a random new parking target that differs from current and isn't right on top of bus
  getRandomSpot(currentSpotId, busX, busY) {
    const candidates = this.parkingSpots.filter(spot => {
      if (currentSpotId && spot.id === currentSpotId) return false;
      if (busX !== undefined && busY !== undefined) {
        const dist = Math.hypot(spot.x - busX, spot.y - busY);
        if (dist < 150) return false; // Prevent spawning right under bus
      }
      return true;
    });

    if (candidates.length === 0) return this.parkingSpots[0];
    const randomIndex = Math.floor(Math.random() * candidates.length);
    return candidates[randomIndex];
  }

  getSpotForRound(round, currentSpotId, busX, busY) {
    const isUsable = (spot) => spot.id !== currentSpotId
      && (busX === undefined || busY === undefined || Math.hypot(spot.x - busX, spot.y - busY) >= 260);
    const candidates = this.parkingSpots.filter(isUsable);
    const fallback = this.parkingSpots.find((spot) => spot.id !== currentSpotId) || this.parkingSpots[0];
    const randomIndex = candidates.length
      ? Math.floor(this.randomUnit(Math.max(1, round), 31) * candidates.length)
      : 0;
    const spot = candidates[randomIndex] || fallback;
    return { ...spot };
  }

  getSpotForLevel(level, currentSpotId, busX, busY) {
    return this.getSpotForRound(level, currentSpotId, busX, busY);
  }

  update(deltaTime) {
    if (this.parkingPass) this.parkingPass.pulse += deltaTime;
    for (const obstacle of this.obstacles) {
      if (!obstacle.motion) continue;
      const motion = obstacle.motion;
      obstacle[motion.axis] += motion.speed * motion.direction * deltaTime;
      if (obstacle[motion.axis] >= motion.max) {
        obstacle[motion.axis] = motion.max;
        motion.direction = -1;
      } else if (obstacle[motion.axis] <= motion.min) {
        obstacle[motion.axis] = motion.min;
        motion.direction = 1;
      }
    }
  }

  draw(ctx) {
    // 1. Asphalt Ground
    ctx.fillStyle = this.theme.ground;
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle asphalt texture grid
    ctx.strokeStyle = this.theme.grid;
    ctx.lineWidth = 1;
    for (let x = 40; x < this.width; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    for (let y = 40; y < this.height; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }

    this.drawEnvironment(ctx);

    // 2. Road Lanes & Driving Area Markers
    this.drawRoadMarkings(ctx);

    // 3. Draw All Parking Bays (empty stall markings)
    this.drawParkingBays(ctx);

    // 4. Draw Obstacles (Parked cars, barriers, trees)
    this.drawObstacles(ctx);

    // 5. Draw the parking permit pickup used from round five.
    this.drawParkingPass(ctx);

    // 6. Draw Curbs & Boundary Walls
    this.drawBoundaryWalls(ctx);
  }

  drawParkingPass(ctx) {
    if (!this.parkingPass) return;
    const pass = this.parkingPass;
    const pulse = 0.5 + Math.sin(pass.pulse * 5) * 0.5;
    ctx.save();
    ctx.translate(pass.x, pass.y);
    ctx.fillStyle = `rgba(250, 204, 21, ${0.12 + pulse * 0.12})`;
    ctx.beginPath();
    ctx.arc(0, 0, 34 + pulse * 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(-0.08);
    ctx.fillStyle = '#FDE047';
    ctx.strokeStyle = '#172554';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(-25, -18, 50, 36, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#172554';
    ctx.font = '900 23px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', 0, 1);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-19, 11, 38, 3);
    ctx.restore();
  }

  drawRoadMarkings(ctx) {
    ctx.save();

    ctx.strokeStyle = this.theme.accent;
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([18, 16]);

    if (this.round < 3) {
      ctx.beginPath();
      ctx.moveTo(80, 275);
      ctx.lineTo(1120, 275);
      ctx.moveTo(80, 525);
      ctx.lineTo(1120, 525);
      ctx.stroke();
    } else {
      // From round three, a central aisle replaces the sparse practice guides.
      ctx.beginPath();
      ctx.moveTo(75, 400);
      ctx.lineTo(1125, 400);
      ctx.stroke();
    }

    ctx.setLineDash([]); // Reset line dash

    // White perimeter lane markings
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 40, this.width - 80, this.height - 80);

    ctx.restore();

    this.drawRoundCourseMarkings(ctx);
  }

  drawRoundCourseMarkings(ctx) {
    if (this.round < 3) return;

    ctx.save();

    // Only broken paint guides are used here. Solid-looking structures are
    // reserved for real collision obstacles and boundary walls.
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.62)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(530, 565);
    ctx.lineTo(530, 735);
    ctx.moveTo(670, 565);
    ctx.lineTo(670, 735);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.76)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(542, 590);
    ctx.lineTo(658, 590);
    ctx.stroke();
    this.drawCourseArrow(ctx, 250, 400, 0);
    this.drawCourseArrow(ctx, 950, 400, Math.PI);
    this.drawCourseArrow(ctx, 600, 665, -Math.PI / 2);

    if (this.round >= 5) {
      // Moving carts get a visible travel rail so their crossing can be read.
      for (const obstacle of this.obstacles.filter((item) => item.motion)) {
        const motion = obstacle.motion;
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.58)';
        ctx.fillStyle = 'rgba(245, 158, 11, 0.055)';
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 8]);
        ctx.beginPath();
        if (motion.axis === 'x') {
          ctx.roundRect(motion.min - obstacle.width / 2 - 10, obstacle.y - obstacle.height / 2 - 10,
            motion.max - motion.min + obstacle.width + 20, obstacle.height + 20, 12);
        } else {
          ctx.roundRect(obstacle.x - obstacle.width / 2 - 10, motion.min - obstacle.height / 2 - 10,
            obstacle.width + 20, motion.max - motion.min + obstacle.height + 20, 12);
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
  }

  drawCourseArrow(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.moveTo(42, 0);
    ctx.lineTo(12, -19);
    ctx.lineTo(12, -7);
    ctx.lineTo(-38, -7);
    ctx.lineTo(-38, 7);
    ctx.lineTo(12, 7);
    ctx.lineTo(12, 19);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawEnvironment(ctx) {
    ctx.save();
    // Three asphalt tones create zones without adding fake collision lines.
    ctx.fillStyle = 'rgba(7, 12, 18, 0.16)';
    ctx.fillRect(35, 55, this.width - 70, 175);
    ctx.fillRect(35, 575, this.width - 70, 170);
    ctx.fillStyle = 'rgba(71, 85, 105, 0.075)';
    ctx.fillRect(35, 245, this.width - 70, 310);

    // Small deterministic asphalt flecks soften the empty digital grid.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
    for (let i = 0; i < 72; i++) {
      const x = 45 + ((i * 167 + 53) % (this.width - 90));
      const y = 45 + ((i * 97 + 29) % (this.height - 90));
      const size = 1 + (i % 3);
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
  }

  drawParkingBays(ctx) {
    // Only the current objective is painted; unused bays do not look like
    // walls or alternate goals.
    this.parkingSpots
      .filter((spot) => spot.id === this.activeParkingSpotId)
      .forEach(spot => {
      ctx.save();
      ctx.translate(spot.x, spot.y);
      ctx.rotate(spot.angle);

      const halfL = spot.length / 2;
      const halfW = spot.width / 2;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.62)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-halfL, -halfW);
      ctx.lineTo(halfL, -halfW);
      ctx.lineTo(halfL, halfW);
      ctx.lineTo(-halfL, halfW);
      ctx.stroke();

      ctx.restore();
    });
  }

  drawObstacles(ctx) {
    this.obstacles.forEach(obs => {
      ctx.save();
      ctx.translate(obs.x, obs.y);
      ctx.rotate(obs.angle || 0);

      const halfW = obs.width / 2;
      const halfH = obs.height / 2;

      // A striped footprint makes every spawned object read as a deliberate
      // driving hazard before the bus reaches its collision box.
      if (['cone-row', 'barricade', 'concrete-block', 'wall-segment', 'workzone', 'tire-stack', 'maintenance-cart'].includes(obs.type)) {
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
        ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 7]);
        ctx.beginPath();
        ctx.roundRect(-halfW - 8, -halfH - 8, obs.width + 16, obs.height + 16, 8);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      if (obs.type === 'wall-segment') {
        ctx.fillStyle = 'rgba(0, 0, 0, .42)';
        ctx.beginPath();
        ctx.roundRect(-halfW + 7, -halfH + 8, obs.width, obs.height, 7);
        ctx.fill();

        ctx.fillStyle = '#6B7280';
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-halfW, -halfH, obs.width, obs.height, 7);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#374151';
        ctx.fillRect(-halfW + 5, -halfH + 7, obs.width - 10, obs.height - 14);
        ctx.fillStyle = '#FBBF24';
        for (let x = -halfW + 12; x < halfW - 8; x += 34) {
          ctx.fillRect(x, -halfH + 3, 18, 5);
          ctx.fillRect(x, halfH - 8, 18, 5);
        }
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 2;
        for (let x = -halfW + 45; x < halfW; x += 45) {
          ctx.beginPath();
          ctx.moveTo(x, -halfH + 8);
          ctx.lineTo(x, halfH - 8);
          ctx.stroke();
        }
        ctx.fillStyle = '#E5E7EB';
        for (const boltX of [-halfW + 17, halfW - 17]) {
          ctx.beginPath();
          ctx.arc(boltX, 0, 4, 0, Math.PI * 2);
          ctx.fill();
        }

      } else if (obs.type === 'maintenance-cart') {
        ctx.fillStyle = 'rgba(0, 0, 0, .36)';
        ctx.beginPath();
        ctx.ellipse(5, halfH - 2, halfW + 5, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rubber bumper and four wheels sit inside the collision rectangle.
        ctx.fillStyle = '#111827';
        ctx.fillRect(-halfW, halfH - 13, obs.width, 10);
        for (const wheelX of [-halfW + 16, halfW - 16]) {
          ctx.fillStyle = '#030712';
          ctx.beginPath();
          ctx.arc(wheelX, halfH - 4, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#6B7280';
          ctx.beginPath();
          ctx.arc(wheelX, halfH - 4, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = obs.color || '#2563EB';
        ctx.strokeStyle = '#172554';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-halfW, -halfH + 9, obs.width, obs.height - 21, 9);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#BAE6FD';
        ctx.strokeStyle = '#0C4A6E';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-halfW + 10, -halfH + 14, 28, 18, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#FEF3C7';
        ctx.fillRect(halfW - 17, -halfH + 17, 9, 8);

        // High-contrast chevrons and a roof beacon signal that this is moving.
        ctx.fillStyle = '#111827';
        ctx.fillRect(-10, -halfH + 13, 34, 19);
        ctx.fillStyle = '#FBBF24';
        ctx.font = '900 17px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obs.motion?.axis === 'x' ? '↔' : '↕', 7, -halfH + 23);
        ctx.fillStyle = '#F97316';
        ctx.beginPath();
        ctx.arc(0, -halfH + 5, 7, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = '#FDBA74';
        ctx.stroke();

      } else if (obs.type === 'cone-row') {
        ctx.fillStyle = 'rgba(0, 0, 0, .34)';
        ctx.beginPath();
        ctx.ellipse(4, halfH - 1, halfW + 3, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        const coneCount = Math.max(3, Math.floor(obs.width / 34));
        for (let i = 0; i < coneCount; i++) {
          const coneX = -halfW + 18 + i * ((obs.width - 36) / Math.max(1, coneCount - 1));
          ctx.fillStyle = '#111827';
          ctx.beginPath();
          ctx.roundRect(coneX - 14, halfH - 9, 28, 9, 3);
          ctx.fill();
          ctx.fillStyle = '#F97316';
          ctx.strokeStyle = '#7C2D12';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(coneX, -halfH + 1);
          ctx.lineTo(coneX - 11, halfH - 8);
          ctx.lineTo(coneX + 11, halfH - 8);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#FFF7ED';
          ctx.fillRect(coneX - 7, 1, 14, 5);
        }

      } else if (obs.type === 'barricade') {
        ctx.fillStyle = 'rgba(0, 0, 0, .32)';
        ctx.fillRect(-halfW + 5, halfH - 7, obs.width, 10);

        ctx.strokeStyle = '#D1D5DB';
        ctx.lineWidth = 6;
        for (const supportX of [-halfW + 22, halfW - 22]) {
          ctx.beginPath();
          ctx.moveTo(supportX, -halfH + 10);
          ctx.lineTo(supportX - 15, halfH);
          ctx.moveTo(supportX, -halfH + 10);
          ctx.lineTo(supportX + 15, halfH);
          ctx.stroke();
        }

        ctx.fillStyle = '#F97316';
        ctx.strokeStyle = '#7C2D12';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-halfW, -12, obs.width, 24, 4);
        ctx.fill();
        ctx.stroke();
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(-halfW + 2, -10, obs.width - 4, 20, 3);
        ctx.clip();
        ctx.strokeStyle = '#FFF7ED';
        ctx.lineWidth = 9;
        for (let x = -halfW - 20; x < halfW + 20; x += 34) {
          ctx.beginPath();
          ctx.moveTo(x, 15);
          ctx.lineTo(x + 20, -15);
          ctx.stroke();
        }
        ctx.restore();

        for (const lampX of [-halfW + 24, halfW - 24]) {
          ctx.fillStyle = '#111827';
          ctx.beginPath();
          ctx.arc(lampX, -halfH + 4, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FBBF24';
          ctx.beginPath();
          ctx.arc(lampX, -halfH + 4, 5, 0, Math.PI * 2);
          ctx.fill();
        }

      } else if (obs.type === 'concrete-block') {
        ctx.fillStyle = 'rgba(0, 0, 0, .34)';
        ctx.fillRect(-halfW + 7, -halfH + 8, obs.width, obs.height);
        ctx.fillStyle = '#9CA3AF';
        ctx.strokeStyle = '#4B5563';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-halfW + 9, -halfH);
        ctx.lineTo(halfW - 9, -halfH);
        ctx.lineTo(halfW, halfH);
        ctx.lineTo(-halfW, halfH);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#111827';
        ctx.fillRect(-halfW + 5, -halfH + 6, obs.width - 10, 9);
        ctx.fillStyle = '#FBBF24';
        for (let x = -halfW + 7; x < halfW - 7; x += 28) {
          ctx.beginPath();
          ctx.moveTo(x, -halfH + 6);
          ctx.lineTo(x + 12, -halfH + 6);
          ctx.lineTo(x + 4, -halfH + 15);
          ctx.lineTo(x - 8, -halfH + 15);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = '#6B7280';
        ctx.beginPath();
        ctx.moveTo(-18, -2);
        ctx.lineTo(-7, 5);
        ctx.lineTo(-13, 13);
        ctx.stroke();

      } else if (obs.type === 'tire-stack') {
        ctx.fillStyle = 'rgba(0, 0, 0, .36)';
        ctx.beginPath();
        ctx.ellipse(5, 8, halfW + 4, halfH - 2, 0, 0, Math.PI * 2);
        ctx.fill();
        const tires = [
          [-halfW + 23, 3], [-halfW + 52, -7], [-halfW + 78, 4], [0, 11]
        ];
        for (const [tireX, tireY] of tires) {
          ctx.fillStyle = '#111827';
          ctx.strokeStyle = '#030712';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(tireX, tireY, 24, 18, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#4B5563';
          ctx.beginPath();
          ctx.ellipse(tireX, tireY, 10, 7, 0, 0, Math.PI * 2);
          ctx.fill();
        }

      } else if (obs.type === 'car') {
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(-halfW + 4, -halfH + 4, obs.width, obs.height);

        // Car Body
        ctx.fillStyle = obs.color || '#3B82F6';
        ctx.beginPath();
        ctx.roundRect(-halfW, -halfH, obs.width, obs.height, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Car Windshields & Windows
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(-halfW + 5, -halfH + 18, obs.width - 10, 14); // Front windshield
        ctx.fillRect(-halfW + 5, halfH - 26, obs.width - 10, 10);  // Rear windshield
        ctx.fillRect(-halfW + 3, -halfH + 34, obs.width - 6, halfH - 20); // Roof

        // Headlights / Tail lights
        ctx.fillStyle = '#FEF08A';
        ctx.fillRect(-halfW + 3, -halfH, 8, 3);
        ctx.fillRect(halfW - 11, -halfH, 8, 3);
        ctx.fillStyle = '#EF4444';
        ctx.fillRect(-halfW + 3, halfH - 3, 8, 3);
        ctx.fillRect(halfW - 11, halfH - 3, 8, 3);

      } else if (obs.type === 'planter') {
        // Green curb planter island
        ctx.fillStyle = '#166534';
        ctx.strokeStyle = '#D1D5DB';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(-halfW, -halfH, obs.width, obs.height, 10);
        ctx.fill();
        ctx.stroke();

        // Trees inside planter
        ctx.fillStyle = '#22C55E';
        for (let y = -halfH + 30; y < halfH; y += 50) {
          ctx.beginPath();
          ctx.arc(0, y, 12, 0, Math.PI * 2);
          ctx.fill();
        }

      } else if (obs.type === 'workzone') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.beginPath();
        ctx.roundRect(-halfW + 5, -halfH + 6, obs.width, obs.height, 10);
        ctx.fill();

        ctx.fillStyle = '#30363B';
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(-halfW, -halfH, obs.width, obs.height, 10);
        ctx.fill();
        ctx.stroke();

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(-halfW + 4, -halfH + 4, obs.width - 8, obs.height - 8, 7);
        ctx.clip();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.26)';
        ctx.lineWidth = 8;
        for (let x = -halfW - obs.height; x < halfW + obs.height; x += 32) {
          ctx.beginPath();
          ctx.moveTo(x, halfH);
          ctx.lineTo(x + obs.height, -halfH);
          ctx.stroke();
        }
        ctx.restore();

        // Evenly spaced cones make the closed area read as intentional.
        const coneCount = Math.max(3, Math.floor(obs.width / 55));
        for (let i = 0; i < coneCount; i++) {
          const coneX = -halfW + 28 + i * ((obs.width - 56) / Math.max(1, coneCount - 1));
          ctx.fillStyle = '#FB923C';
          ctx.beginPath();
          ctx.moveTo(coneX, -8);
          ctx.lineTo(coneX - 8, 10);
          ctx.lineTo(coneX + 8, 10);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#FFF7ED';
          ctx.fillRect(coneX - 5, 2, 10, 3);
        }

      } else if (obs.type === 'platform') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.roundRect(-halfW + 6, -halfH + 7, obs.width, obs.height, 12);
        ctx.fill();

        ctx.fillStyle = '#263B44';
        ctx.strokeStyle = '#647A83';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-halfW, -halfH, obs.width, obs.height, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#38BDF8';
        ctx.fillRect(-halfW + 14, -halfH + 8, obs.width - 28, 4);
        ctx.fillRect(-halfW + 14, halfH - 12, obs.width - 28, 4);

        ctx.fillStyle = '#0F2026';
        for (let x = -halfW + 70; x < halfW - 20; x += 76) {
          ctx.beginPath();
          ctx.roundRect(x, -12, 48, 24, 5);
          ctx.fill();
          ctx.fillStyle = '#48616B';
          ctx.fillRect(x + 8, -3, 32, 6);
          ctx.fillStyle = '#0F2026';
        }

        ctx.fillStyle = '#E0F2FE';
        ctx.beginPath();
        ctx.arc(-halfW + 34, 0, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#075985';
        ctx.font = '900 18px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obs.label || 'T', -halfW + 34, 1);

      } else if (obs.type === 'barrier') {
        ctx.fillStyle = '#8B949B';
        ctx.beginPath();
        ctx.roundRect(-halfW, -halfH, obs.width, obs.height, 4);
        ctx.fill();
        ctx.strokeStyle = '#424A50';
        ctx.lineWidth = 2;
        ctx.strokeRect(-halfW, -halfH, obs.width, obs.height);

        ctx.fillStyle = '#F59E0B';
        if (obs.width >= obs.height) {
          for (let x = -halfW + 8; x < halfW - 4; x += 24) ctx.fillRect(x, -halfH + 3, 10, obs.height - 6);
        } else {
          for (let y = -halfH + 8; y < halfH - 4; y += 24) ctx.fillRect(-halfW + 3, y, obs.width - 6, 10);
        }
      }

      ctx.restore();
    });
  }

  drawBoundaryWalls(ctx) {
    this.walls.forEach(w => {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, .4)';
      ctx.fillRect(w.x - w.width / 2 + 4, w.y - w.height / 2 + 5, w.width, w.height);
      ctx.fillStyle = this.theme.wall;
      ctx.fillRect(w.x - w.width / 2, w.y - w.height / 2, w.width, w.height);

      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x - w.width / 2, w.y - w.height / 2, w.width, w.height);

      // Repeating reflectors make the collision boundary read as a curb wall.
      ctx.fillStyle = '#EAB308';
      if (w.width > w.height) {
        for (let x = w.x - w.width / 2 + 12; x < w.x + w.width / 2 - 8; x += 48) {
          ctx.fillRect(x, w.y - 4, 22, 8);
        }
      } else {
        for (let y = w.y - w.height / 2 + 12; y < w.y + w.height / 2 - 8; y += 48) {
          ctx.fillRect(w.x - 4, y, 8, 22);
        }
      }
      ctx.restore();
    });
  }
}

window.GameMap = GameMap;

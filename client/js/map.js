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

    // Each stage is a distinct one-bay map rather than a shared parking lot.
    this.stageLayouts = {
      1: {
        name: '연습 주차장',
        code: 'TRAINING LOT',
        theme: { ground: '#202731', grid: '#28313D', accent: '#EAB308', wall: '#3A4654' },
        spawnPoint: { x: 600, y: 690, angle: -Math.PI / 2 },
        parkingSpots: [
          { id: 2, name: '연습장 정면 주차', x: 600, y: 145, angle: Math.PI / 2 },
          { id: 6, name: '연습장 우측 주차', x: 1015, y: 405, angle: 0 }
        ],
        obstacles: [
          { x: 360, y: 145, width: 44, height: 95, angle: 0, type: 'car', color: '#3B82F6' },
          { x: 840, y: 145, width: 44, height: 95, angle: 0, type: 'car', color: '#F97316' },
          { x: 360, y: 655, width: 44, height: 95, angle: 0, type: 'car', color: '#EC4899' },
          { x: 840, y: 655, width: 44, height: 95, angle: 0, type: 'car', color: '#06B6D4' }
        ]
      },
      2: {
        name: '도심 공사 구역',
        code: 'CITY WORKS',
        theme: { ground: '#252A2E', grid: '#2D3439', accent: '#F59E0B', wall: '#444B50' },
        spawnPoint: { x: 1010, y: 675, angle: Math.PI },
        parkingSpots: [
          { id: 1, name: '공사장 좌측 주차', x: 170, y: 145, angle: Math.PI / 2 },
          { id: 3, name: '공사장 우측 주차', x: 1030, y: 405, angle: Math.PI / 2 }
        ],
        obstacles: [
          { x: 860, y: 145, width: 44, height: 95, angle: 0, type: 'car', color: '#F97316' },
          { x: 960, y: 145, width: 44, height: 95, angle: 0, type: 'car', color: '#8B5CF6' },
          { x: 455, y: 575, width: 210, height: 72, angle: 0, type: 'workzone' },
          { x: 735, y: 345, width: 190, height: 72, angle: 0, type: 'workzone' }
        ]
      },
      3: {
        name: '야간 버스 터미널',
        code: 'NIGHT TERMINAL',
        theme: { ground: '#17272D', grid: '#20333A', accent: '#38BDF8', wall: '#344B53' },
        spawnPoint: { x: 1020, y: 690, angle: Math.PI },
        parkingSpots: [
          { id: 4, name: '터미널 좌측 평행 주차', x: 205, y: 405, angle: 0 },
          { id: 5, name: '터미널 우측 평행 주차', x: 985, y: 405, angle: Math.PI }
        ],
        obstacles: [
          { x: 660, y: 175, width: 410, height: 72, angle: 0, type: 'platform', label: 'A' },
          { x: 660, y: 600, width: 410, height: 72, angle: 0, type: 'platform', label: 'B' },
          { x: 335, y: 155, width: 44, height: 95, angle: 0, type: 'car', color: '#60A5FA' },
          { x: 1080, y: 185, width: 24, height: 150, angle: 0, type: 'barrier' }
        ]
      }
    };

    this.setStage(1);
  }

  setStage(level) {
    const stage = Math.max(1, Math.min(Object.keys(this.stageLayouts).length, level));
    const layout = this.stageLayouts[stage];
    this.stage = stage;
    this.stageName = layout.name;
    this.stageCode = layout.code;
    this.theme = { ...layout.theme };
    this.spawnPoint = { ...layout.spawnPoint };
    this.obstacles = layout.obstacles.map((obstacle) => ({ ...obstacle }));
    this.parkingSpots = layout.parkingSpots.map((parkingSpot) => ({
      ...parkingSpot,
      width: CONFIG.PARKING.WIDTH,
      length: CONFIG.PARKING.LENGTH
    }));
    this.activeParkingSpotId = this.parkingSpots[0].id;
  }

  setActiveParkingSpot(spot) {
    if (spot) this.activeParkingSpotId = spot.id;
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

  getSpotForLevel(level, currentSpotId, busX, busY) {
    const difficulty = CONFIG.DIFFICULTY[Math.max(0, Math.min(CONFIG.DIFFICULTY.length - 1, level - 1))];
    let candidates = this.parkingSpots.filter((spot) => {
      if (!difficulty.spotIds.includes(spot.id)) return false;
      if (currentSpotId && spot.id === currentSpotId) return false;
      if (busX !== undefined && busY !== undefined) {
        return Math.hypot(spot.x - busX, spot.y - busY) >= 140;
      }
      return true;
    });

    if (candidates.length === 0) {
      candidates = this.parkingSpots.filter((spot) => difficulty.spotIds.includes(spot.id));
    }

    const spot = candidates[0];
    return {
      ...spot,
      width: difficulty.spotWidth,
      length: difficulty.spotLength,
      difficultyLevel: difficulty.level
    };
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
    this.drawStageStamp(ctx);

    // 2. Road Lanes & Driving Area Markers
    this.drawRoadMarkings(ctx);

    // 3. Draw All Parking Bays (empty stall markings)
    this.drawParkingBays(ctx);

    // 4. Draw Obstacles (Parked cars, barriers, trees)
    this.drawObstacles(ctx);

    // 5. Draw Curbs & Boundary Walls
    this.drawBoundaryWalls(ctx);
  }

  drawRoadMarkings(ctx) {
    ctx.save();

    ctx.strokeStyle = this.theme.accent;
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([18, 16]);

    if (this.stage === 1) {
      ctx.beginPath();
      ctx.moveTo(80, 275);
      ctx.lineTo(1120, 275);
      ctx.moveTo(80, 525);
      ctx.lineTo(1120, 525);
      ctx.stroke();
    } else if (this.stage === 2) {
      ctx.beginPath();
      ctx.moveTo(1090, 675);
      ctx.lineTo(830, 675);
      ctx.bezierCurveTo(650, 675, 670, 450, 565, 450);
      ctx.bezierCurveTo(430, 450, 500, 245, 340, 245);
      ctx.lineTo(95, 245);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(1080, 700);
      ctx.lineTo(930, 700);
      ctx.quadraticCurveTo(870, 700, 870, 640);
      ctx.lineTo(870, 505);
      ctx.quadraticCurveTo(870, 455, 815, 455);
      ctx.lineTo(100, 455);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(100, 330);
      ctx.lineTo(940, 330);
      ctx.stroke();
    }

    ctx.setLineDash([]); // Reset line dash

    // White perimeter lane markings
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 40, this.width - 80, this.height - 80);

    ctx.restore();
  }

  drawStageStamp(ctx) {
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.font = '800 18px ui-monospace, monospace';
    ctx.fillText(`0${this.stage} / ${this.stageCode}`, this.width - 55, this.height - 48);
    ctx.restore();
  }

  drawEnvironment(ctx) {
    ctx.save();
    if (this.stage === 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.018)';
      ctx.fillRect(45, 70, this.width - 90, 145);
      ctx.fillRect(45, 585, this.width - 90, 145);
    } else if (this.stage === 2) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.035)';
      ctx.fillRect(45, 85, this.width - 90, 115);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.fillRect(45, 625, this.width - 90, 105);
    } else {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.028)';
      ctx.fillRect(45, 285, this.width - 90, 215);
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.14)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(45, 285);
      ctx.lineTo(this.width - 45, 285);
      ctx.moveTo(45, 500);
      ctx.lineTo(this.width - 45, 500);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawParkingBays(ctx) {
    // Only the current objective is visible; the second bay appears on clear.
    this.parkingSpots
      .filter((spot) => spot.id === this.activeParkingSpotId)
      .forEach(spot => {
      ctx.save();
      ctx.translate(spot.x, spot.y);
      ctx.rotate(spot.angle);

      const halfL = spot.length / 2;
      const halfW = spot.width / 2;

      // Draw U-shaped stall outline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 3;
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

      if (obs.type === 'car') {
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
      // Outer Curb texture
      ctx.fillStyle = this.theme.wall;
      ctx.fillRect(w.x - w.width / 2, w.y - w.height / 2, w.width, w.height);

      // Yellow/Black caution pattern on border
      ctx.strokeStyle = '#6B7280';
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x - w.width / 2, w.y - w.height / 2, w.width, w.height);
      ctx.restore();
    });
  }
}

window.GameMap = GameMap;

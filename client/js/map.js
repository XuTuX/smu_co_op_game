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
        theme: { ground: '#1E2430', grid: '#262F3E', accent: '#FACC15', wall: '#374151' },
        spawnPoint: { x: 600, y: 690, angle: -Math.PI / 2 },
        parkingSpot: { id: 2, name: '연습장 정면 주차', x: 600, y: 145, angle: Math.PI / 2 },
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
        theme: { ground: '#2A2721', grid: '#373229', accent: '#FB923C', wall: '#57534E' },
        spawnPoint: { x: 1000, y: 650, angle: Math.PI },
        parkingSpot: { id: 1, name: '공사장 좌측 주차', x: 165, y: 150, angle: Math.PI / 2 },
        obstacles: [
          { x: 820, y: 145, width: 44, height: 95, angle: 0, type: 'car', color: '#F97316' },
          { x: 930, y: 145, width: 44, height: 95, angle: 0, type: 'car', color: '#A855F7' },
          { x: 570, y: 390, width: 105, height: 250, angle: 0, type: 'planter' },
          { x: 360, y: 600, width: 230, height: 28, angle: 0, type: 'barrier' },
          { x: 825, y: 500, width: 190, height: 28, angle: -0.18, type: 'barrier' }
        ]
      },
      3: {
        name: '야간 버스 터미널',
        code: 'NIGHT TERMINAL',
        theme: { ground: '#142B31', grid: '#1E3A40', accent: '#22D3EE', wall: '#334E55' },
        spawnPoint: { x: 950, y: 665, angle: Math.PI },
        parkingSpot: { id: 4, name: '터미널 평행 주차', x: 190, y: 385, angle: 0 },
        obstacles: [
          { x: 340, y: 155, width: 44, height: 95, angle: 0, type: 'car', color: '#60A5FA' },
          { x: 730, y: 155, width: 44, height: 95, angle: 0, type: 'car', color: '#F472B6' },
          { x: 910, y: 155, width: 44, height: 95, angle: 0, type: 'car', color: '#FBBF24' },
          { x: 610, y: 430, width: 100, height: 310, angle: 0, type: 'planter' },
          { x: 350, y: 650, width: 210, height: 26, angle: 0, type: 'barrier' },
          { x: 820, y: 520, width: 200, height: 26, angle: 0.12, type: 'barrier' }
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
    this.parkingSpots = [{
      ...layout.parkingSpot,
      width: CONFIG.PARKING.WIDTH,
      length: CONFIG.PARKING.LENGTH
    }];
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

    const spot = candidates[Math.floor(Math.random() * candidates.length)];
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
    ctx.lineWidth = 3;
    ctx.setLineDash([20, 15]);

    if (this.stage === 1) {
      ctx.beginPath();
      ctx.moveTo(80, 275);
      ctx.lineTo(1120, 275);
      ctx.moveTo(80, 525);
      ctx.lineTo(1120, 525);
      ctx.stroke();
    } else if (this.stage === 2) {
      ctx.beginPath();
      ctx.moveTo(1080, 690);
      ctx.lineTo(1080, 560);
      ctx.lineTo(700, 560);
      ctx.quadraticCurveTo(620, 560, 620, 480);
      ctx.lineTo(620, 270);
      ctx.quadraticCurveTo(620, 230, 570, 230);
      ctx.lineTo(90, 230);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.roundRect(105, 95, this.width - 210, this.height - 190, 80);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(90, 520);
      ctx.lineTo(1110, 520);
      ctx.stroke();
    }

    ctx.setLineDash([]); // Reset line dash

    // White perimeter lane markings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 40, this.width - 80, this.height - 80);

    if (this.stage === 1) {
      this.drawArrow(ctx, 350, 275, 0);
      this.drawArrow(ctx, 850, 275, 0);
      this.drawArrow(ctx, 850, 525, Math.PI);
      this.drawArrow(ctx, 350, 525, Math.PI);
    } else if (this.stage === 2) {
      this.drawArrow(ctx, 880, 560, Math.PI);
      this.drawArrow(ctx, 620, 350, -Math.PI / 2);
      this.drawArrow(ctx, 360, 230, Math.PI);
    } else {
      this.drawArrow(ctx, 930, 520, Math.PI);
      this.drawArrow(ctx, 270, 520, Math.PI);
      this.drawArrow(ctx, 1080, 335, -Math.PI / 2);
    }

    ctx.restore();
  }

  drawStageStamp(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.font = '900 42px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`0${this.stage} · ${this.stageCode}`, 62, 82);
    ctx.restore();
  }

  drawArrow(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.moveTo(25, 0);
    ctx.lineTo(10, -12);
    ctx.lineTo(10, -5);
    ctx.lineTo(-25, -5);
    ctx.lineTo(-25, 5);
    ctx.lineTo(10, 5);
    ctx.lineTo(10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawParkingBays(ctx) {
    // Draw white / light-yellow parking stall lines for all spots
    this.parkingSpots.forEach(spot => {
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

      } else if (obs.type === 'barrier') {
        // Concrete barrier with hazard diagonal stripes
        ctx.fillStyle = '#9CA3AF';
        ctx.fillRect(-halfW, -halfH, obs.width, obs.height);
        ctx.strokeStyle = '#4B5563';
        ctx.lineWidth = 2;
        ctx.strokeRect(-halfW, -halfH, obs.width, obs.height);

        // Hazard stripes
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-halfW + 5, -halfH);
        ctx.lineTo(-halfW + 20, halfH);
        ctx.stroke();
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

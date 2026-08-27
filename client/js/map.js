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

    // Static obstacles (Parked cars, concrete islands, planters)
    this.obstacles = [
      // Beginner map: a few parked cars around the edges and a wide-open center.
      { x: 360, y: 145, width: 44, height: 95, angle: 0, type: 'car', color: '#3B82F6' },
      { x: 840, y: 145, width: 44, height: 95, angle: 0, type: 'car', color: '#F97316' },
      { x: 360, y: 655, width: 44, height: 95, angle: 0, type: 'car', color: '#EC4899' },
      { x: 840, y: 655, width: 44, height: 95, angle: 0, type: 'car', color: '#06B6D4' }
    ];

    // Predefined Candidate Parking Slots (Large enough for Bus)
    // Angles: 0 = horizontal facing right, PI/2 = vertical facing down, PI = horizontal facing left, -PI/2 = vertical facing up
    this.parkingSpots = [
      // Three roomy destination bays across the top.
      { id: 1, name: 'A-1 (Top Left)', x: 150, y: 145, angle: Math.PI / 2, width: CONFIG.PARKING.WIDTH, length: CONFIG.PARKING.LENGTH },
      { id: 2, name: 'A-2 (Top Center)', x: 600, y: 145, angle: Math.PI / 2, width: CONFIG.PARKING.WIDTH, length: CONFIG.PARKING.LENGTH },
      { id: 3, name: 'A-3 (Top Right)', x: 1050, y: 145, angle: Math.PI / 2, width: CONFIG.PARKING.WIDTH, length: CONFIG.PARKING.LENGTH },

      // Two easy parallel bays on the outside of the open practice area.
      { id: 4, name: 'B-1 (Left)', x: 170, y: 430, angle: 0, width: CONFIG.PARKING.WIDTH, length: CONFIG.PARKING.LENGTH },
      { id: 5, name: 'B-2 (Right)', x: 1030, y: 430, angle: Math.PI, width: CONFIG.PARKING.WIDTH, length: CONFIG.PARKING.LENGTH }
    ];

    // Initial bus spawn position & angle
    this.spawnPoint = { x: 600, y: 690, angle: -Math.PI / 2 };
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
    ctx.fillStyle = '#1E2430';
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle asphalt texture grid
    ctx.strokeStyle = '#262F3E';
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

    // Central Driving Way (Two-way lane markings)
    ctx.strokeStyle = '#FACC15'; // Yellow dashed center line
    ctx.lineWidth = 3;
    ctx.setLineDash([20, 15]);

    // Top driving lane
    ctx.beginPath();
    ctx.moveTo(80, 275);
    ctx.lineTo(1120, 275);
    ctx.stroke();

    // Bottom driving lane
    ctx.beginPath();
    ctx.moveTo(80, 525);
    ctx.lineTo(1120, 525);
    ctx.stroke();

    ctx.setLineDash([]); // Reset line dash

    // White perimeter lane markings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 40, this.width - 80, this.height - 80);

    // Directional Driving Arrows
    this.drawArrow(ctx, 350, 275, 0);          // Eastbound top
    this.drawArrow(ctx, 850, 275, 0);          // Eastbound top
    this.drawArrow(ctx, 850, 525, Math.PI);    // Westbound bottom
    this.drawArrow(ctx, 350, 525, Math.PI);    // Westbound bottom

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
      ctx.fillStyle = '#374151';
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

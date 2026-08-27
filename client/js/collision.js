/**
 * Separating Axis Theorem (SAT) Collision System for Rotated Rectangles (OBB)
 */
class CollisionSystem {
  // Get 4 corner vertices of an obstacle (supports rotated obstacles)
  static getObstacleCorners(obs) {
    const angle = obs.angle || 0;
    const halfW = obs.width / 2;
    const halfH = (obs.height || obs.length) / 2;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Map objects are drawn with width on the local X axis and height on
    // the local Y axis. Keep collision geometry identical to rendering.
    // The previous implementation swapped these axes, turning the top and
    // bottom boundary walls into invisible vertical walls over the bus spawn.
    const localCorners = [
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH }
    ];

    return localCorners.map((corner) => ({
      x: obs.x + corner.x * cos - corner.y * sin,
      y: obs.y + corner.x * sin + corner.y * cos
    }));
  }

  // Project polygon vertices onto an axis
  static projectPolygon(axis, vertices) {
    let min = axis.x * vertices[0].x + axis.y * vertices[0].y;
    let max = min;
    for (let i = 1; i < vertices.length; i++) {
      const p = axis.x * vertices[i].x + axis.y * vertices[i].y;
      if (p < min) min = p;
      if (p > max) max = p;
    }
    return { min, max };
  }

  // Check overlap of two polygons using SAT
  static testPolygonOverlap(polyA, polyB) {
    const polygons = [polyA, polyB];
    let minOverlap = Infinity;
    let smallestAxis = null;

    for (let p = 0; p < polygons.length; p++) {
      const polygon = polygons[p];
      for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        const edgeX = polygon[j].x - polygon[i].x;
        const edgeY = polygon[j].y - polygon[i].y;

        // Perpendicular normal vector
        let axisX = -edgeY;
        let axisY = edgeX;
        const len = Math.hypot(axisX, axisY);
        if (len === 0) continue;
        axisX /= len;
        axisY /= len;

        const projA = this.projectPolygon({ x: axisX, y: axisY }, polyA);
        const projB = this.projectPolygon({ x: axisX, y: axisY }, polyB);

        // Check for gap
        if (projA.max < projB.min || projB.max < projA.min) {
          return null; // Separating axis found: No collision
        }

        const overlap = Math.min(projA.max, projB.max) - Math.max(projA.min, projB.min);
        if (overlap < minOverlap) {
          minOverlap = overlap;
          smallestAxis = { x: axisX, y: axisY };
        }
      }
    }

    return { overlap: minOverlap, axis: smallestAxis };
  }

  // Check and resolve collisions between Bus and Map objects
  static checkBusCollisions(bus, map, onCollide) {
    const busCorners = bus.getCorners();
    let collided = false;

    // 1. Check outer boundary walls
    for (const wall of map.walls) {
      const wallCorners = this.getObstacleCorners(wall);
      const sat = this.testPolygonOverlap(busCorners, wallCorners);
      if (sat) {
        collided = true;
        bus.rollback(0.25);
        if (onCollide) onCollide({ x: bus.x, y: bus.y, speed: bus.prevSpeed });
        return true;
      }
    }

    // 2. Check static obstacles (cars, barriers, planters)
    for (const obs of map.obstacles) {
      const obsCorners = this.getObstacleCorners(obs);
      const sat = this.testPolygonOverlap(busCorners, obsCorners);
      if (sat) {
        collided = true;
        bus.rollback(0.3);
        if (onCollide) onCollide({ x: bus.x, y: bus.y, speed: bus.prevSpeed });
        return true;
      }
    }

    return collided;
  }
}

window.CollisionSystem = CollisionSystem;

import rough from "./_snowpack/pkg/roughjs.js";
const BACKGROUND_COLOR = "#ccccbb";
const STROKE_DARK = "#444400";
const STROKE_LIGHT = "#aaaa88";
const STROKE_HIGHLIGHT = "#AA4444";
var ControlPointType;
(function(ControlPointType2) {
  ControlPointType2[ControlPointType2["VANISHING_POINT"] = 0] = "VANISHING_POINT";
  ControlPointType2[ControlPointType2["BOX_POINT_1"] = 1] = "BOX_POINT_1";
  ControlPointType2[ControlPointType2["BOX_POINT_2"] = 2] = "BOX_POINT_2";
  ControlPointType2[ControlPointType2["LIGHT"] = 3] = "LIGHT";
  ControlPointType2[ControlPointType2["LIGHT_DROP"] = 4] = "LIGHT_DROP";
})(ControlPointType || (ControlPointType = {}));
function mapMap(map, f) {
  const entries = Array.from(map).map(([k, v]) => [k, f(k, v)]);
  return new Map(entries);
}
function mapReplace(map, replaceKey, f) {
  return mapMap(map, (k, v) => k === replaceKey ? f(v) : v);
}
function isOnLeftOf(p1, p2, p) {
  if (p1 === p2 || p === p1 || p === p2) {
    return false;
  }
  const a = p2.vectorFrom(p1);
  const b = p.vectorFrom(p1);
  return a.x * b.y - b.x * a.y > 0;
}
function convexHull(s) {
  if (s.length < 3) {
    throw new Error("Convex hull needs at least three points");
  }
  let l = 0;
  for (let i = 1; i < s.length; i++) {
    if (s[i].x < s[l].x) {
      l = i;
    }
  }
  let p = l;
  const hull = [];
  let max = s.length + 1;
  do {
    hull.push(s[p]);
    let q = (p + 1) % s.length;
    for (let i = 0; i < s.length; i++) {
      if (isOnLeftOf(s[p], s[q], s[i])) {
        q = i;
      }
    }
    p = q;
  } while (p !== l && --max > 0);
  return hull;
}
class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  draw(g, rc, r, selected) {
    rc.circle(this.x, this.y, r * 2, {
      stroke: selected ? STROKE_HIGHLIGHT : STROKE_LIGHT,
      strokeWidth: selected ? 2 : 1
    });
  }
  vectorFrom(other) {
    return new Vector(this.x - other.x, this.y - other.y);
  }
  plus(v) {
    return new Point(this.x + v.x, this.y + v.y);
  }
  minus(other) {
    return new Point(this.x - other.x, this.y - other.y);
  }
}
const _Vector = class {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  times(m) {
    return new _Vector(this.x * m, this.y * m);
  }
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
};
let Vector = _Vector;
Vector.UP = new _Vector(0, -100);
class Line {
  constructor(begin, end, stopAtBegin, stopAtEnd) {
    this.begin = begin;
    this.end = end;
    this.stopAtBegin = stopAtBegin;
    this.stopAtEnd = stopAtEnd;
  }
  static upFrom(p) {
    return new Line(p, p.plus(Vector.UP), true, true);
  }
  draw(g, rc, dark) {
    const r = this.end.vectorFrom(this.begin);
    let length = r.length();
    if (length === 0) {
      return;
    }
    const large = r.times(4e3 / length);
    const p1 = this.stopAtBegin ? this.begin : this.begin.minus(large);
    const p2 = this.stopAtEnd ? this.end : this.end.plus(large);
    rc.line(p1.x, p1.y, p2.x, p2.y, {
      stroke: dark ? STROKE_DARK : STROKE_LIGHT,
      disableMultiStroke: !dark
    });
  }
  intersectWith(other) {
    const tr = this.end.vectorFrom(this.begin);
    const or = other.end.vectorFrom(other.begin);
    const denom = tr.y * or.x - tr.x * or.y;
    if (denom === 0) {
      throw new Error("Lines are parallel");
    }
    const t = ((this.begin.x - other.begin.x) * or.y - (this.begin.y - other.begin.y) * or.x) / denom;
    return this.begin.plus(tr.times(t));
  }
}
class Box {
  constructor(p1, p2, depth) {
    this.p1 = p1;
    this.p2 = p2;
    this.depth = depth;
  }
  draw(g, rc, config) {
    const frontPoints = [
      this.p1,
      new Point(this.p1.x, this.p2.y),
      this.p2,
      new Point(this.p2.x, this.p1.y)
    ];
    const backPoints = frontPoints.map((p) => p.plus(config.vanishingPoint.vectorFrom(p).times(0.3)));
    const topPoints = [frontPoints[1], backPoints[1], backPoints[2], frontPoints[2]];
    const bottomPoints = [frontPoints[0], backPoints[0], backPoints[3], frontPoints[3]];
    const lightLines = [];
    const lightDropLines = [];
    const shadow = [];
    for (let i = 0; i < 4; i++) {
      const top = topPoints[i];
      const bottom = bottomPoints[i];
      const lightLine = new Line(config.light, top, true, false);
      lightLines.push(lightLine);
      const lightDropLine = new Line(config.lightDrop, bottom, true, false);
      lightDropLines.push(lightDropLine);
      shadow.push(lightLine.intersectWith(lightDropLine));
    }
    const fullShadow = convexHull([...shadow, ...bottomPoints]);
    rc.polygon(fullShadow.map((p) => [p.x, p.y]), {
      fill: "black",
      fillStyle: "cross-hatch"
    });
    rc.polygon(bottomPoints.map((p) => [p.x, p.y]), {
      fill: BACKGROUND_COLOR,
      fillStyle: "solid"
    });
    for (let i = 0; i < frontPoints.length; i++) {
      const line = new Line(config.vanishingPoint, frontPoints[i], true, true);
      line.draw(g, rc, false);
    }
    for (let i = 0; i < frontPoints.length; i++) {
      const line = new Line(frontPoints[i], frontPoints[(i + 1) % frontPoints.length], true, true);
      line.draw(g, rc, true);
    }
    for (let i = 0; i < backPoints.length; i++) {
      const line = new Line(backPoints[i], backPoints[(i + 1) % backPoints.length], true, true);
      line.draw(g, rc, true);
    }
    for (let i = 0; i < 4; i++) {
      new Line(frontPoints[i], backPoints[i], true, true).draw(g, rc, true);
    }
    lightLines.forEach((line) => line.draw(g, rc, false));
    lightDropLines.forEach((line) => line.draw(g, rc, false));
  }
}
const _ControlPoint = class extends Point {
  constructor(p) {
    super(p.x, p.y);
  }
  drawControlPoint(g, rc, selected) {
    super.draw(g, rc, _ControlPoint.RADIUS, selected);
  }
  isClickedOn(p) {
    return p.vectorFrom(this).length() <= _ControlPoint.RADIUS;
  }
};
let ControlPoint = _ControlPoint;
ControlPoint.RADIUS = 10;
class ControlPoints {
  constructor(points, selected, delta) {
    this.points = points;
    this.selected = selected;
    this.delta = delta;
  }
  get(cpt) {
    const cp = this.points.get(cpt);
    if (cp === void 0) {
      throw new Error("ControlPointType " + cpt + " not found");
    }
    return cp;
  }
  draw(g, rc) {
    for (const [cpt, cp] of this.points.entries()) {
      const selected = cpt === this.selected;
      cp.drawControlPoint(g, rc, selected);
    }
  }
  select(p) {
    for (const [cpt, cp] of this.points.entries()) {
      if (cp.isClickedOn(p)) {
        return new ControlPoints(this.points, cpt, p.vectorFrom(cp));
      }
    }
    return new ControlPoints(this.points, void 0, void 0);
  }
  moveTo(p) {
    if (this.selected !== void 0 && this.delta !== void 0) {
      const newPoint = new ControlPoint(p.minus(this.delta));
      let newMap = mapReplace(this.points, this.selected, () => newPoint);
      if (this.selected === 3) {
        newMap = mapReplace(newMap, 4, (cp) => new ControlPoint(new Point(newPoint.x, cp.y)));
      }
      if (this.selected === 4) {
        newMap = mapReplace(newMap, 3, (cp) => new ControlPoint(new Point(newPoint.x, cp.y)));
      }
      return new ControlPoints(newMap, this.selected, this.delta);
    }
    return this;
  }
  deselect() {
    return new ControlPoints(this.points, void 0, void 0);
  }
}
class Config {
  constructor(width, height, controlPoints) {
    this.width = width;
    this.height = height;
    this.controlPoints = controlPoints;
    this.vanishingPoint = controlPoints.get(0);
    this.box = new Box(controlPoints.get(1), controlPoints.get(2), 50);
    this.light = controlPoints.get(3);
    this.lightDrop = controlPoints.get(4);
  }
  draw(g, rc) {
    g.fillStyle = BACKGROUND_COLOR;
    g.fillRect(0, 0, this.width, this.height);
    rc.line(0, this.vanishingPoint.y, this.width, this.vanishingPoint.y);
    this.controlPoints.draw(g, rc);
    this.box.draw(g, rc, this);
  }
}
function main() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const canvas = document.querySelector("canvas");
  canvas.width = width;
  canvas.height = height;
  const rc = rough.canvas(canvas);
  const g = canvas.getContext("2d");
  if (g === null) {
    throw new Error("Context is null");
  }
  const controlPoints = new ControlPoints(new Map([
    [0, new ControlPoint(new Point(width / 2, height / 2))],
    [1, new ControlPoint(new Point(width / 4, height / 2 + 300))],
    [2, new ControlPoint(new Point(width / 4 + 300, height / 2 + 50))],
    [3, new ControlPoint(new Point(width / 5, height / 4))],
    [4, new ControlPoint(new Point(width / 5, height * 0.6))]
  ]), void 0, void 0);
  let config = new Config(width, height, controlPoints);
  config.draw(g, rc);
  canvas.addEventListener("mousedown", (e) => {
    const cps = config.controlPoints.select(new Point(e.x, e.y));
    config = new Config(width, height, cps);
    config.draw(g, rc);
  });
  canvas.addEventListener("mouseup", () => {
    const cps = config.controlPoints.deselect();
    config = new Config(width, height, cps);
    config.draw(g, rc);
  });
  canvas.addEventListener("mousemove", (e) => {
    if (config.controlPoints.selected !== void 0) {
      const cps = config.controlPoints.moveTo(new Point(e.x, e.y));
      config = new Config(width, height, cps);
      config.draw(g, rc);
    }
  });
}
main();

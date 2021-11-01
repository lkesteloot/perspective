import rough from "roughjs";
import {RoughCanvas} from "roughjs/bin/canvas";

const BACKGROUND_COLOR = "#ccccbb";
const STROKE_DARK = "#444400";
const STROKE_LIGHT = "#aaaa88";
const STROKE_HIGHLIGHT = "#AA4444";

enum ControlPointType {
    VANISHING_POINT,
    BOX_POINT_1,
    BOX_POINT_2,
    LIGHT,
    LIGHT_DROP,
}

function mapMap<K,V>(map: Map<K,V>, f: (k: K, v: V) => V): Map<K,V> {
    const entries = Array.from(map).map(([k, v]) => [k, f(k, v)]) as [K,V][];
    return new Map<K,V>(entries);
}

function mapReplace<K,V>(map: Map<K,V>, replaceKey: K, f: (v: V) => V): Map<K,V> {
    return mapMap(map, (k, v) => k === replaceKey ? f(v) : v);
}

function isOnLeftOf(p1: Point, p2: Point, p: Point): boolean {
    if (p1 === p2 || p === p1 || p === p2) {
        return false;
    }

    const a = p2.vectorFrom(p1);
    const b = p.vectorFrom(p1);

    return a.x*b.y - b.x*a.y > 0;
}

function convexHull(s: Point[]): Point[] {
    if (s.length < 3) {
        throw new Error("Convex hull needs at least three points");
    }

    // Start with left-most point.
    let l = 0;
    for (let i = 1; i < s.length; i++) {
        if (s[i].x < s[l].x) {
            l = i;
        }
    }

    // https://en.wikipedia.org/wiki/Gift_wrapping_algorithm
    let p = l;
    const hull: Point[] = [];
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
    public readonly x: number;
    public readonly y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    public draw(g: CanvasRenderingContext2D, rc: RoughCanvas, r: number, selected: boolean): void {
        rc.circle(this.x, this.y, r*2, {
            stroke: selected ? STROKE_HIGHLIGHT : STROKE_LIGHT,
            strokeWidth: selected ? 2 : 1,
        });
    }

    public vectorFrom(other: Point): Vector {
        return new Vector(this.x - other.x, this.y - other.y);
    }

    public plus(v: Vector): Point {
        return new Point(this.x + v.x, this.y + v.y);
    }

    public minus(other: Vector): Point {
        return new Point(this.x - other.x, this.y - other.y);
    }
}

class Vector {
    public readonly x: number;
    public readonly y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    public times(m: number): Vector {
        return new Vector(this.x * m, this.y * m);
    }

    public length(): number {
        return Math.sqrt(this.x*this.x + this.y*this.y);
    }
}

class Line {
    public readonly begin: Point;
    public readonly end: Point;
    public readonly stopAtBegin: boolean;
    public readonly stopAtEnd: boolean;

    constructor(begin: Point, end: Point, stopAtBegin: boolean, stopAtEnd: boolean) {
        this.begin = begin;
        this.end = end;
        this.stopAtBegin = stopAtBegin;
        this.stopAtEnd = stopAtEnd;
    }

    public draw(g: CanvasRenderingContext2D, rc: RoughCanvas, dark: boolean): void {
        const r = this.end.vectorFrom(this.begin);
        let length = r.length();
        if (length === 0) {
            return;
        }
        const large = r.times(4000/length);

        const p1 = this.stopAtBegin ? this.begin : this.begin.minus(large);
        const p2 = this.stopAtEnd ? this.end : this.end.plus(large);

        rc.line(p1.x, p1.y, p2.x, p2.y, {
            stroke: dark ? STROKE_DARK : STROKE_LIGHT,
            disableMultiStroke: !dark,
        });
    }

    public intersectWith(other: Line): Point {
        const tr = this.end.vectorFrom(this.begin);
        const or = other.end.vectorFrom(other.begin);

        const denom = tr.y*or.x - tr.x*or.y;
        if (denom === 0) {
            throw new Error("Lines are parallel");
        }

        const t = ((this.begin.x - other.begin.x)*or.y - (this.begin.y - other.begin.y)*or.x)/denom;

        return this.begin.plus(tr.times(t));
    }
}

class Box {
    public readonly p1: Point;
    public readonly p2: Point;
    public readonly depth: number;

    constructor(p1: Point, p2: Point, depth: number) {
        this.p1 = p1;
        this.p2 = p2;
        this.depth = depth;
    }

    public draw(g: CanvasRenderingContext2D, rc: RoughCanvas, config: Config) {
        const frontPoints: Point[] = [
            this.p1,
            new Point(this.p1.x, this.p2.y),
            this.p2,
            new Point(this.p2.x, this.p1.y),
        ];

        const backPoints = frontPoints.map(p => p.plus(config.vanishingPoint.vectorFrom(p).times(0.3)));
        const topPoints = [ frontPoints[1], backPoints[1], backPoints[2], frontPoints[2] ];
        const bottomPoints = [ frontPoints[0], backPoints[0], backPoints[3], frontPoints[3] ];

        const lightLines: Line[] = [];
        const lightDropLines: Line[] = [];
        const shadow: Point[] = [];
        for (let i = 0; i < 4; i++) {
            const top = topPoints[i];
            const bottom = bottomPoints[i];

            const lightLine = new Line(config.light, top, true, false);
            lightLines.push(lightLine);

            const lightDropLine = new Line(config.lightDrop, bottom, true, false);
            lightDropLines.push(lightDropLine);

            shadow.push(lightLine.intersectWith(lightDropLine));
        }

        // Actual shadow.
        const fullShadow = convexHull([... shadow, ... bottomPoints]);
        rc.polygon(fullShadow.map(p => [p.x, p.y]), {
            fill: "black",
            fillStyle: "cross-hatch",
        });

        // Erase bottom box.
        rc.polygon(bottomPoints.map(p => [p.x, p.y]), {
            fill: BACKGROUND_COLOR,
            fillStyle: "solid",
        });

        // Lines from vanishing point.
        for (let i = 0; i < frontPoints.length; i++) {
            const line = new Line(config.vanishingPoint, frontPoints[i], true, true);
            line.draw(g, rc, false);
        }

        // Front rectangle.
        for (let i = 0; i < frontPoints.length; i++) {
            const line = new Line(frontPoints[i], frontPoints[(i + 1) % frontPoints.length], true, true);
            line.draw(g, rc, true);
        }

        // Back rectangle.
        for (let i = 0; i < backPoints.length; i++) {
            const line = new Line(backPoints[i], backPoints[(i + 1) % backPoints.length], true, true);
            line.draw(g, rc, true);
        }

        // Connect from to back rectangle.
        for (let i = 0; i < 4; i++) {
            new Line(frontPoints[i], backPoints[i], true, true).draw(g, rc, true);
        }

        // Shadow lines.
        lightLines.forEach(line => line.draw(g, rc, false));
        lightDropLines.forEach(line => line.draw(g, rc, false));
    }
}

class ControlPoint extends Point {
    public static RADIUS = 10;

    constructor(p: Point) {
        super(p.x, p.y);
    }

    public drawControlPoint(g: CanvasRenderingContext2D, rc: RoughCanvas, selected: boolean): void {
        super.draw(g, rc, ControlPoint.RADIUS, selected);
    }

    public isClickedOn(p: Point): boolean {
        return p.vectorFrom(this).length() <= ControlPoint.RADIUS;
    }
}

class ControlPoints {
    public readonly points: Map<ControlPointType,ControlPoint>;
    public readonly selected: ControlPointType | undefined;
    public readonly delta: Vector | undefined;

    constructor(points: Map<ControlPointType,ControlPoint>, selected: ControlPointType | undefined, delta: Vector | undefined) {
        this.points = points;
        this.selected = selected;
        this.delta = delta;
    }

    public get(cpt: ControlPointType): ControlPoint {
        const cp = this.points.get(cpt);
        if (cp === undefined) {
            throw new Error("ControlPointType " + cpt + " not found");
        }

        return cp;
    }

    public draw(g: CanvasRenderingContext2D, rc: RoughCanvas): void {
        for (const [cpt, cp] of this.points.entries()) {
            const selected = cpt === this.selected;
            cp.drawControlPoint(g, rc, selected);
        }
    }

    public select(p: Point): ControlPoints {
        for (const [cpt, cp] of this.points.entries()) {
            if (cp.isClickedOn(p)) {
                return new ControlPoints(this.points, cpt, p.vectorFrom(cp));
            }
        }

        return new ControlPoints(this.points, undefined, undefined);
    }

    public moveTo(p: Point): ControlPoints {
        if (this.selected !== undefined && this.delta !== undefined) {
            const newPoint = new ControlPoint(p.minus(this.delta));
            let newMap = mapReplace(this.points, this.selected, () => newPoint);
            if (this.selected === ControlPointType.LIGHT) {
                // Move the drop too.
                newMap = mapReplace(newMap, ControlPointType.LIGHT_DROP, cp => new ControlPoint(new Point(newPoint.x, cp.y)));
            }
            if (this.selected === ControlPointType.LIGHT_DROP) {
                // Move the light too.
                newMap = mapReplace(newMap, ControlPointType.LIGHT, cp => new ControlPoint(new Point(newPoint.x, cp.y)));
            }

            return new ControlPoints(newMap, this.selected, this.delta);
        }

        return this;
    }

    public deselect(): ControlPoints {
        return new ControlPoints(this.points, undefined, undefined);
    }
}

class Config {
    public readonly width: number;
    public readonly height: number;
    public readonly controlPoints: ControlPoints;
    public readonly vanishingPoint: Point;
    public readonly box: Box;
    public readonly light: Point;
    public readonly lightDrop: Point;

    constructor(width: number, height: number, controlPoints: ControlPoints) {
        this.width = width;
        this.height = height;
        this.controlPoints = controlPoints;
        this.vanishingPoint = controlPoints.get(ControlPointType.VANISHING_POINT);
        this.box = new Box(controlPoints.get(ControlPointType.BOX_POINT_1), controlPoints.get(ControlPointType.BOX_POINT_2), 50);
        this.light = controlPoints.get(ControlPointType.LIGHT);
        this.lightDrop = controlPoints.get(ControlPointType.LIGHT_DROP);
    }

    public draw(g: CanvasRenderingContext2D, rc: RoughCanvas): void {
        g.fillStyle = BACKGROUND_COLOR;
        g.fillRect(0, 0, this.width, this.height);

        rc.line(0, this.vanishingPoint.y, this.width, this.vanishingPoint.y);

        this.controlPoints.draw(g, rc);

        this.box.draw(g, rc, this);
    }
}

function main() {
    let width = window.innerWidth;
    let height = window.innerHeight;

    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    canvas.width = width;
    canvas.height = height;

    const rc = rough.canvas(canvas);

    const g = canvas.getContext("2d");
    if (g === null) {
        throw new Error("Context is null");
    }

    const controlPoints = new ControlPoints(new Map<ControlPointType,ControlPoint>([
        // Vanishing point.
        [ControlPointType.VANISHING_POINT, new ControlPoint(new Point(width / 2, height / 2))],

        // Box.
        [ControlPointType.BOX_POINT_1, new ControlPoint(new Point(width / 4, height / 2 + 300))],
        [ControlPointType.BOX_POINT_2, new ControlPoint(new Point(width / 4 + 300, height / 2 + 50))],

        // Light and its projection on the ground.
        [ControlPointType.LIGHT, new ControlPoint(new Point(width / 5, height / 4))],
        [ControlPointType.LIGHT_DROP, new ControlPoint(new Point(width / 5, height * .60))],
    ]), undefined, undefined);

    let config = new Config(width, height, controlPoints);
    config.draw(g, rc);

    canvas.addEventListener("mousedown", e => {
        const cps = config.controlPoints.select(new Point(e.x, e.y));
        config  = new Config(width, height, cps);
        config.draw(g, rc);
    });
    canvas.addEventListener("mouseup", () => {
        const cps = config.controlPoints.deselect();
        config  = new Config(width, height, cps);
        config.draw(g, rc);
    });
    canvas.addEventListener("mousemove", e => {
        if (config.controlPoints.selected !== undefined) {
            const cps = config.controlPoints.moveTo(new Point(e.x, e.y));
            config  = new Config(width, height, cps);
            config.draw(g, rc);
        }
    });
    window.addEventListener("resize", () => {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;

        config  = new Config(width, height, config.controlPoints);
        config.draw(g, rc);
    });
}

main();

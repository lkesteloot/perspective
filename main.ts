
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

class Point {
    public readonly x: number;
    public readonly y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    public draw(g: CanvasRenderingContext2D, r: number): void {
        g.beginPath();
        g.arc(this.x, this.y, r, 0, Math.PI*2);
        g.stroke();
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
    public static UP = new Vector(0, -100);
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

    public static upFrom(p: Point): Line {
        return new Line(p, p.plus(Vector.UP), true, true);
    }

    public draw(g: CanvasRenderingContext2D): void {
        g.beginPath();
        g.moveTo(this.begin.x, this.begin.y);
        g.lineTo(this.end.x, this.end.y);
        g.stroke();
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

    public draw(g: CanvasRenderingContext2D, config: Config) {
        const frontPoints: Point[] = [
            this.p1,
            new Point(this.p1.x, this.p2.y),
            this.p2,
            new Point(this.p2.x, this.p1.y),
        ];

        g.strokeStyle = STROKE_LIGHT;
        for (let i = 0; i < frontPoints.length; i++) {
            const line = new Line(config.vanishingPoint, frontPoints[i], true, false);
            line.draw(g);
        }

        g.strokeStyle = STROKE_DARK;
        for (let i = 0; i < frontPoints.length; i++) {
            const line = new Line(frontPoints[i], frontPoints[(i + 1) % frontPoints.length], true, true);
            line.draw(g);
        }

        const backPoints = frontPoints.map(p => p.plus(config.vanishingPoint.vectorFrom(p).times(0.3)));
        for (let i = 0; i < backPoints.length; i++) {
            const line = new Line(backPoints[i], backPoints[(i + 1) % backPoints.length], true, true);
            line.draw(g);
        }
        for (let i = 0; i < 4; i++) {
            new Line(frontPoints[i], backPoints[i], true, true).draw(g);
        }
    }
}

class ControlPoint extends Point {
    public static RADIUS = 10;

    constructor(p: Point) {
        super(p.x, p.y);
    }

    public draw(g: CanvasRenderingContext2D): void {
        super.draw(g, ControlPoint.RADIUS);
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

    public draw(g: CanvasRenderingContext2D): void {
        g.save();
        for (const [cpt, cp] of this.points.entries()) {
            const selected = cpt === this.selected;
            g.strokeStyle = selected ? STROKE_HIGHLIGHT : STROKE_LIGHT;
            g.lineWidth = selected ? 2 : 1;
            cp.draw(g);
        }
        g.restore();
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
            let newMap = ControlPoints.replace(this.points, this.selected, newPoint);
            if (this.selected === ControlPointType.LIGHT) {
                // Move the drop too.
                const oldPoint = newMap.get(ControlPointType.LIGHT_DROP) as ControlPoint;
                newMap = ControlPoints.replace(newMap, ControlPointType.LIGHT_DROP, new ControlPoint(new Point(newPoint.x, oldPoint.y)));
            }
            if (this.selected === ControlPointType.LIGHT_DROP) {
                // Move the light too.
                const oldPoint = newMap.get(ControlPointType.LIGHT) as ControlPoint;
                newMap = ControlPoints.replace(newMap, ControlPointType.LIGHT, new ControlPoint(new Point(newPoint.x, oldPoint.y)));
            }

            return new ControlPoints(newMap, this.selected, this.delta);
        }

        return this;
    }

    public deselect(): ControlPoints {
        return new ControlPoints(this.points, undefined, undefined);
    }

    private static replace(points: Map<ControlPointType,ControlPoint>, newCpt: ControlPointType, newPoint: ControlPoint): Map<ControlPointType,ControlPoint> {
        const newPoints = Array.from(points).map(
            ([cpt, cp]) => [cpt, cpt === newCpt ? newPoint : cp]) as [ControlPointType,ControlPoint][];
        return new Map<ControlPointType,ControlPoint>(newPoints);
    }
}

class Config {
    public readonly width: number;
    public readonly height: number;
    public readonly controlPoints: ControlPoints;
    public readonly vanishingPoint: Point;
    public readonly box: Box;

    constructor(width: number, height: number, controlPoints: ControlPoints) {
        this.width = width;
        this.height = height;
        this.controlPoints = controlPoints;
        this.vanishingPoint = controlPoints.get(ControlPointType.VANISHING_POINT);
        this.box = new Box(controlPoints.get(ControlPointType.BOX_POINT_1), controlPoints.get(ControlPointType.BOX_POINT_2), 50);
    }

    public draw(g: CanvasRenderingContext2D): void {
        g.fillStyle = "#ccccbb";
        g.fillRect(0, 0, this.width, this.height);

        g.strokeStyle = STROKE_DARK;
        g.beginPath();
        g.moveTo(0, this.vanishingPoint.y);
        g.lineTo(this.width, this.vanishingPoint.y);
        g.stroke();

        this.controlPoints.draw(g);

        this.box.draw(g, this);
    }
}

function main() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    canvas.width = width;
    canvas.height = height;

    const g = canvas.getContext("2d");
    if (g === null) {
        throw new Error("Context is null");
    }

    const controlPoints = new ControlPoints(new Map<ControlPointType,ControlPoint>([
        // Vanishing point.
        [ControlPointType.VANISHING_POINT, new ControlPoint(new Point(width / 2, height / 2))],

        // Box.
        [ControlPointType.BOX_POINT_1, new ControlPoint(new Point(width / 4, height / 2 + 200))],
        [ControlPointType.BOX_POINT_2, new ControlPoint(new Point(width / 4 + 300, height / 2 - 300))],

        // Light and its projection on the ground.
        [ControlPointType.LIGHT, new ControlPoint(new Point(width / 5, height / 4))],
        [ControlPointType.LIGHT_DROP, new ControlPoint(new Point(width / 5, height * 3 / 4))],
    ]), undefined, undefined);

    let config = new Config(width, height, controlPoints);
    config.draw(g);

    canvas.addEventListener("mousedown", e => {
        const cps = config.controlPoints.select(new Point(e.x, e.y));
        config  = new Config(width, height, cps);
        config.draw(g);
    });
    canvas.addEventListener("mouseup", () => {
        const cps = config.controlPoints.deselect();
        config  = new Config(width, height, cps);
        config.draw(g);
    });
    canvas.addEventListener("mousemove", e => {
        if (config.controlPoints.selected !== undefined) {
            const cps = config.controlPoints.moveTo(new Point(e.x, e.y));
            config  = new Config(width, height, cps);
            config.draw(g);
        }
    })
}

main();

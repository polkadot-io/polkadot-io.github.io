let canvas = document.getElementById('dots');
let ctx = canvas.getContext('2d');
let compartmentSize = 100;
var dots = [];
var initialT = Date.now();
var rotation;
var scale;
var visible;
init();
window.onresize = resize;
setInterval(tick, 20);

function compartments() {
	let s = Math.max(canvas.width, canvas.height) / 2 * 1.3;
	return Math.ceil(s / compartmentSize) * Math.ceil(s / compartmentSize);
}

function animate(t, prevT) {
	const number = dots.length * 0.2;
	const period = 100;
	const duration = 200;
	if (Math.floor(t / period) != Math.floor(previousT / period)) {
		var movers = {};
		var indices = [];
		let n = Math.min(t / period * 2, number);
		for (var i = 0; i < n; ++i) {
			var x;
			do {
				x = Math.floor(Math.pow(1 - Math.pow(Math.random(), 4), 1.4) * dots.length);
			} while (movers[x] !== undefined || dots[x].moving());
			movers[x] = true;
			indices.push(i);
		}
		movers = Object.keys(movers);
		for (var i = 0; i < n; ++i) {
			let x = Math.floor(Math.random(n));
			let a = indices[i];
			indices[i] = indices[x];
			indices[x] = a;
		}
		indices.forEach((f, i) => dots[movers[f]].move(dots[movers[i]].p, duration));
	}

	var comp = {};
	dots.forEach(d => {
		d.animate(t, prevT);
		if (comp[d.compartment] == null)
			comp[d.compartment] = [d];
		else
			comp[d.compartment].push(d);
	});
	for (var c in comp) {
		comp[c].forEach(d => comp[c].forEach(e => {
			if (e !== d) {
				d.leanAway(e.p);
			}
		}))
	}
}

function resize() {
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
}

function redraw(t, prevT) {
	ctx.resetTransform();
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.translate(canvas.width / 2, canvas.height / 2);
 	ctx.rotate(-Math.PI / 180 * rotation(t));
	s = scale(t);
	ctx.scale(s.x, s.y);
	dots.forEach(d => d.draw(t));
}

var previousT = 0;
function tick() {
	let t = (Date.now() - initialT) / 20;

	let o = 50;
	let m = 500;

	if (t >= 300 && previousT < 300)
		visible = (t, d) => true;
	if (t >= o && previousT < o)
		rotation = t => 7 + (t - o) / 10 * (t - o) / m;
	if (t >= o + m && previousT < o + m)
		rotation = t => 7 + (t - o) / 10;
	
	animate(t, previousT);
	redraw(t, previousT);
	previousT = t;
}

function init() {
	resize();
	dots = [];
	for (var i = 0; i < 64 * 64; ++i)
		dots.push(new Particle);
	dots.forEach((d, i) => {
		let x = i % 64 - 32;
		let y = Math.floor(i / 64) - 32;
		d.teleport(new Vector(x * 37, (i % 2 ? -10 : 10) + y * 40));
	});
	dots = dots.filter(d => d.p.len() < Math.max(canvas.width, canvas.height) / 2 * 1.3);
	dots.sort((a, b) => a.centrality < b.centrality);
	dots.reverse();

	var seeds = [];
	for (var i = 0; i < 4; ++i)
		seeds.push(new Vector(Math.random() * canvas.width - canvas.width / 2, Math.random() * canvas.height - canvas.height / 2));
	visible = (t, dot) => seeds.find((s, i) => dot.p.minus(s).len() < t * 5 - i * 100) !== undefined; 

	rotation = t => 7;
	scale = t => new Vector(1, 1);

	redraw();
}

function Vector(x, y) {
	this.x = x || 0;
	this.y = y || 0;

	this.clone = () => new Vector(this.x, this.y);
	this.plus = v => new Vector(this.x + v.x, this.y + v.y);
	this.minus = v => new Vector(this.x - v.x, this.y - v.y);
	this.over = d => new Vector(this.x / d, this.y / d);
	this.times = d => new Vector(this.x * d, this.y * d);
	this.overMin = (d, m) => new Vector(Math.abs(this.x) > m ? this.x / d : this.x, Math.abs(this.y) > m ? this.y / d : this.y);
	 
	this.set = v => { this.x = v.x; this.y = v.y; return this; };
	this.add = v => { this.x += v.x; this.y += v.y; return this; };
	this.sub = v => { this.x -= v.x; this.y -= v.y; return this; };
	this.mul = v => { this.x *= v.x; this.y *= v.y; return this; };
	this.div = v => { this.x /= v.x; this.y /= v.y; return this; };

	this.eq = v => this.x == v.x && this.y == v.y;
	this.len = v => Math.sqrt(this.x * this.x + this.y * this.y);
}

Vector.lerp = (a, b, x) => new Vector(b.x * x + a.x * (1 - x), b.y * x + a.y * (1 - x));
Vector.sinerp = (a, b, x) => Vector.lerp(a, b, Math.cos(Math.PI * x) / 2 + 0.5);

function Particle() {
	this.p = new Vector;
	this.centrality = 0;
	this.lean = new Vector;
	this.s = 13;
	this.r = 13;
	this.c = '#fff';
	this.anim = null;
	this.visible = () => true;

	this.teleport = p => { this.p.set(p); this.positionChanged(); };
	this.positionChanged = () => {
		this.centrality = this.p.len();
		let columns = Math.ceil(Math.max(canvas.width, canvas.height) * 3 / compartmentSize);
		let xc = Math.floor((this.p.x + 32 * 37) / compartmentSize);
		let yc = Math.floor((this.p.y + 32 * 40) / compartmentSize);
		this.compartment = xc + yc * columns;
		//this.c = `hsl(${this.compartment / compartments() * 360}, 100%, 50%)`;
	};
	this.moving = () => this.anim != null;
	this.move = (p, d) => this.anim = {
		f: this.p.clone(),
		t: p.clone(),
		d: d || 300,
		ftime: null
	};
	this.leanAway = (p) => {
		// push lean away from p if it's within 30 of us.
/*		let d = p.minus(this.p.plus(this.lean));
		let l = d.len();
		if (l < 20 && l > 0) {
			let x = Math.pow(l, 3) / 2;
			this.lean.add(new Vector(-d.x / x, -d.y / x));
		}*/
	};
 
	this.draw = t => {
		if (visible(t, this)) {
			let p = this.p.plus(this.lean);
			ctx.beginPath();
			ctx.arc(p.x, p.y, this.r, 0, Math.PI * 2, false);
			ctx.closePath();
			ctx.fillStyle = this.c;
			ctx.fill();
		}
	};

	this.animate = (t, pt) => {
/*		this.lean.x /= 2;
		this.lean.y /= 2;*/
		if (this.anim != null) {
			let anim = this.anim;
			if (anim.ftime == null)
				anim.ftime = t;
			let thru = (t - anim.ftime) / anim.d;
			if (thru < 1)
				this.p = Vector.sinerp(anim.f, anim.t, thru);
			else {
				this.p = anim.t;
				this.anim = null;
			}
			this.positionChanged();
		}
	};
}

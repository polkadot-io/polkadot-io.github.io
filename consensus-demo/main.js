function rand256() { return Math.floor(Math.random() * 256); }
function mix(seed, n) {
	var hash = 0;
	let s = `${n},${seed}`;
    for (i = 0; i < s.length; i++) {
        char = s.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash % 256;
}

function isProgression(old, _new) {
	// we assume _new is non-null.
	if (!old && _new) {
		return true;
	}
	if (_new.order < old.order) {
		return false;
	}
	if (_new.order === old.order) {
		if (JSON.stringify(old) !== JSON.stringify(_new)) {
			return null;
		}
		return false;
	}

	if (old.isValid !== _new.isValid && old.isValid !== null) {
		return null;
	}
	if (!podEqual(old.proposal, _new.proposal) && old.proposal) {
		return null;
	}

	if (!podEqual(old.groupValidity, _new.groupValidity) && old.groupValidity) {
		if (!_new.groupValidity) { return null; }
		if (old.groupValidity.findIndex((o, i) => o !== _new.groupValidity[i] && o !== null) !== -1) {
			return null;
		}
	}
	return true;
}

function podEqual(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}

class Table {
	constructor (groups, members, address) {
		this.address = address;
		this.groups = groups;
		this.members = members;
		this.threshold = this.members - 1 - Math.floor((this.members - 1) / 3);
		this.states = [];
		this.results = [];
		for (let i = 0; i < groups; ++i) {
			this.states.push({});
			let r = [];
			for (let j = 0; j < members; ++j) {
				// valid may be true (decided valid), false (we evaluated it invalid or at
				// least one group member reject it as invalid) or an integer (this many
				// group members have vouched it valid)
				r.push({score: 0, valid: 0, tally: {}});
			}
			this.results.push(r);
		}
	}

	noteState (addr, state) {
		// TODO: check that this is a valid iteration on the previous proposal
		let prevState = this.states[addr.group][addr.index];
		let p = isProgression(prevState, state);
		if (p === null) {
			throw {message: `Forked progression. Punish peer.`, prevState, state};
		}
		if (p === false) {
			console.warn(`Attempt to note old state: Ignoring.`);
			return false;
		}

		console.log(`${this.address}.noteState: ${addr} := `, state);

		if ((!prevState || !prevState.proposal) && state.proposal) {
			// TODO accumulate PSRN from ticket for ordering.
			for (let i = 0; i < this.groups; ++i) {
				for (let j = 0; j < this.members; ++j) {
					// Simple ordering for now. should eventually make it a monotonic-shuffle.
					this.results[i][j].score += mix(state.proposal.ticket, i * this.members + j);
				}
			}
		}

		// accumulate group validity.
		// luckily we can blindly reaccumulate since duplicate operations don't matter:
		// x && a && a == x && a.
		if (state.groupValidity) {
			state.groupValidity.forEach((v, i) => {
				let target = this.results[addr.group][i];
				if (i !== addr.index) {
					if (v === false) {
						target.valid = false;
					} else if (v === true && !target.tally[addr.index]) {
						target.tally[addr.index] = true;
						target.valid++;
					}
				}
			});
		}

		// apply any known validity
		if (typeof(state.isValid) === 'boolean') {
			this.results[addr.group][addr.index].valid = state.isValid;
		}

		this.states[addr.group][addr.index] = state;

		return true;
	}

	// returns either null or the index of the group member that we consider
	// currently most likely to be the proposal around which consensus will form.
	// in the case of our group, it's the item that we consider valid which has
	// most preference votes.
	// for other groups, it's the item that has the most preference votes among
	// those with above-threshold peer-validity.
	groupLeader (g) {
		let candidates = this.results[g]
			.map((c, i) => ({ valid: c.valid === true || c.valid >= this.threshold, score: c.score, index: i}))
			.filter(c => c.valid && this.states[g][c.index].proposal);
		return candidates.length == 0
			? null
			: this.states[g][candidates.sort((a, b) => a.score < b.score)[0].index].proposal;
	}

	// returns an array of members of our group with either true, false or null
	// representing what we think of their proposal's validity.
	groupValidity (g) {
		return this.results[g].map(_ =>
			_.valid === true || _.valid >= this.threshold
				? true
			: _.valid === false
				? false
				: null
		);
	}

	// returns the array of proposals (one for each group) that we currently
	// believe consesus will form around. if we do not yet have sufficient data
	// to produce this, returns null.
	finalVote () {
		return this.results.map((_, i) => this.groupLeader(i));
	}
}

class Address {
	constructor(group, index) {
		this.group = group;
		this.index = index;
	}

	toString () {
		return `${String.fromCharCode(65 + this.group)}${this.index}`;
	}
}

class Proposal {
	constructor(ticket, valid) {
		this.ticket = ticket;
		this.valid = valid;
	}

	toString () {
		return `«${this.ticket}${this.valid ? '' : 'XXX'}»`;
	}
}

class Node {
	constructor (id, world) {
		this.id = id;
		this.world = world;
		this.peers = [];
		this.nullAcceptance = 5;
	}

	render () {
		return `
			<td>${this.id}</td>
			<td>${this.proposal}</td>
			<td>${this.proposalDuration}</td>
			<td>${(this.table.finalVote() || []).map((v, i) => `${String.fromCharCode(65 + i)}: ${v}`).join('; ')}</td>`;
	}

	// Happens at the beginning of a round.
	// We figure out our proposal for our group.
	newRound () {
		this.incoming = [];
		this.outgoing = [];
		this.lastGroupValidity = null;
		this.proposal = null;

		this.proposalDuration = Math.floor(Math.random() * 4);
		this.address = this.world.address(this.id);
		this.table = new Table(this.world.groups, this.world.members, this.address);
		this.order = 0;
	}

	addPeer (id) {
		if (this.peers.indexOf(id) == -1) {
			this.peers.push(id);
		}
	}

	killPeer (id) {
		this.peers = this.peers.filter(x => x.id != id);
	}

	checkProposal () {
		if (this.proposal) {
			return;
		}

		if (this.world.clock > this.proposalDuration) {
			// Not byzantine - we always create valid proposals. This is inherently accessible by any node (though easiest for those in the same group).
			// The collator's address. Similarity to the golden address helps determine other nodes in this group's preference for this proposal.
			// Also functions as a seed to help create a total ordering over candidates and have the majority arrive at the same aggregate-proposal.
			// Once received by peers cannot be changed for this round.
			this.proposal = new Proposal(rand256(), true);
			this.table.noteState(
				this.world.address(this.id),
				{
					proposal: this.proposal,
					order: 0,
					isValid: true	// we always believe our own proposals are valid.
				}
			);
		}
	}

	readMessages () {
		this.incoming.forEach(m => {
			if (m.type === 'proposal') {
				let address = this.world.address(m.from);

				let state = Object.assign({}, m);
				delete state.type;
				delete state.from;

				if (address.group === this.address.group) {
					// fill in isValid.
					state.isValid = state.proposal.valid;
					// we care about their opinions of their own group only if they're not in our group.
					delete state.groupValidity;
				}

				if (this.table.noteState(address, state)) {
					this.outgoing.push(m);
				}
			} else {
				console.warn(`Unknown message type: ${m.type}`, m);
			}
		});
		this.incoming = [];
	}

	sendMessages () {
		if (this.proposal) {
			let groupValidity = this.table.groupValidity(this.address.group);
			if (this.order === 0 || !podEqual(groupValidity, this.lastGroupValidity)) {
				this.peers.forEach(p => this.world.send(this.id, p, {
					type: 'proposal',
					from: this.id,
					proposal: this.proposal,
					// What this node considers as to the validity of the group members.
					// Proposing an invalid item is a punishable offence and will result
					// in a later round of checks. For the purposes of finalisation,
					// it rules out candidates that are `false` here. For any candidate,
					// a minimum number of `true`s in this category from group members
					// are required before outsiders will consider them valid to vote/ratify
					// in their aggregate block proposal.
					groupValidity,
					order: this.order++
				}));
				this.lastGroupValidity = groupValidity;
			}
		}

		// TODO: relay other proposals
		this.outgoing.forEach(m =>
			this.peers.forEach(p => {
				if (p.id != m.from) {	// don't relay to the original sender.
					this.world.send(this.id, p, m);
				}
			})
		);
		this.outgoing = [];
	}

	// if we have a full table, we are ready to vote and ratify.
	checkTable () {
		let fv = this.table.finalVote();
		fv = this.world.clock >= this.nullAcceptance || fv.indexOf(null) === -1 ? fv : null;

		if (fv !== null) {
			// go ahead and vote/ratify.
			console.info(`${this.address} would ratify`, fv);
		}
	}

	tickRound () {
		this.readMessages();
		this.checkProposal();
		this.checkTable();
		this.sendMessages();
	}
}

function shuffle(n) {
	// Generates array with length parameter n (i.e. [0,1,2] for n of 3 then shuffles
	let loopFactor = 16;
	let ret = Array.apply(null, Array(n)).map(function (x, i) { return i; });
	for (let i = 0; i < n * loopFactor; ++i) {
		let x = Math.floor(Math.random() * n);
		let y = i % n;
		if (x != y) {
			let d = ret[y];
			ret[y] = ret[x];
			ret[x] = d;
		}
	}
	return ret;
}

class World {
	constructor () {
		this.groups = 4;
		this.members = 3;

		this.nodes = [];
		for (let i = 0; i < this.groups * this.members; ++i) {
			this.nodes.push(new Node(i, this));
		}

		this.connectLinear();
	}

	startRound () {
		// fixed for now.
		this.clock = 0;

		this.shuffle = shuffle(this.nodes.length);
		this.nodes.forEach(_ => _.newRound());
	}

	tickRound () {
		this.nodes.forEach(_ => _.tickRound());
		this.clock++;
	}

	address (i) {
		let ioi = this.shuffle.indexOf(i);
		let index = ioi % this.members;
		return new Address((ioi - index) / this.members, index);
	}

	indexOf (a) {
		return this.shuffle[a.group * this.members + a.index];
	}

	connectAll () {
		// all-connected for now.
		this.nodes.forEach((n, i) =>
			this.nodes.forEach((m, j) =>
				{ if (i < j) { this.connect(n, m); } }
			)
		);
	}

	connectEnough() {
		let s = shuffle(this.nodes.length);
		s.forEach((n, i) => {
			if (i > 0) {
				let j = s[Math.floor(Math.random() * i)];
				this.connect(this.nodes[n], this.nodes[j]);
			}
		});
	}

	connectLinear() {
		/*
		 * Uses shuffle function to obtain shuffled array of nodes of length n (i.e. [0,2,1]
		 * Uses connect function to match nodes instances (for shuffled array index and value) by updating their peer attribute
		 */
		let s = shuffle(this.nodes.length);
		s.forEach((n, i) => {
			if (i > 0) {
				let j = s[i - 1];
				this.connect(this.nodes[n], this.nodes[j]);
			}
		});
	}

	connect (p1, p2) {
		p1.addPeer(p2.id);
		p2.addPeer(p1.id);
	}

	disconnect (p1, p2) {
		p1.killPeer(p2.id);
		p2.killPeer(p1.id);
	}

	send (from, to, msg) {
		console.log(`${from} => ${to}:`, msg);
		this.nodes[to].incoming.push(msg);
	}

	render() {
		let h = `<div style="float: left"><div>Time: ${this.clock}</div>`;
		h += `<table cellspacing=0 cellpadding=10>`;
		h += `<th><td></td><td>ID</td><td>Proposal</td><td>Ready</td><td>Final</td></th>`;
		for (let g = 0; g < this.groups; ++g) {
			for (let i = 0; i < this.members; ++i) {
				h += `<tr>`;
				if (i == 0) {
					h += `<td rowspan="${this.members}" style="background: #eee">${String.fromCharCode(65 + g)}</td>`;
				}
				let id = this.indexOf(new Address(g, i));
				h += `<td style="background: #eee">${i}</td>${this.nodes[id].render()}`;
				h += `<td>`;
				for (let g = 0; g < this.groups; ++g) {
					for (let i = 0; i < this.members; ++i) {
					}
				}
				h += `</td>`;
				h += `</tr>`;
			}
		}
		h += '</table>';
		h += '</div>';
		return h;
	}
}

var world = new World();
world.startRound();

function start() {
	world.startRound();
	update();
}

function tick() {
	world.tickRound();
	update();
}

function update() {
	if (typeof window == "undefined") { return; }
	window.world = world;
	document.getElementById('app').innerHTML = window.world.render();
}

update();

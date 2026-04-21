"""
Modified Tower of Hanoi — A* & BFS Solver
==========================================

Problem Definition
------------------
N disks of varying size (1…N) and color (Red / Blue / Green) are
distributed across three pegs (A, B, C).  Standard rules apply:
only the topmost disk on a peg may be moved, and a disk may not
be placed atop a strictly smaller disk.

The **goal** is to move all disks onto Peg C such that:
  1. Disks are in ascending size order (largest at bottom).
  2. The resulting color sequence (top → bottom) matches a given
     target color configuration.

The target color arrangement is an *independent* constraint—it
may differ from the natural colour ordering of the current disks.
When the target is achievable (i.e.\ the multiset of target
colours matches the multiset of disk colours), the solver finds
the optimal move sequence.  When it is not, the solver reports
that no solution exists.

State Representation
--------------------
    State = ( Peg_A, Peg_B, Peg_C )
    where each Peg = ( (size, color), … ) ordered bottom → top.

Heuristic (A*)
--------------
h(s) = number of disks not in their correct goal position.
Each such disk requires ≥ 1 move to reach its target position,
so h is admissible.  The heuristic is also consistent: moving one
disk changes at most one disk's (peg, position) pair, so
|h(s) − h(s')| ≤ 1 = cost(s, s') for every transition.  A* with
a consistent heuristic expands each state at most once and is
guaranteed to find an optimal solution.

Complexity Analysis
-------------------
Let N = number of disks.

| Metric | A* Search              | BFS                    |
|--------|------------------------|------------------------|
| Time   | O(3^N · N)             | Θ(3^N · N)             |
| Space  | O(3^N · N)             | Θ(3^N · N)             |

The reachable state space contains at most 3^N configurations
(each of N disks resides on one of 3 pegs).  Generating
successors for each state requires O(P²) = O(1) work (P = 3).
The heuristic is computed in O(N).  With a consistent heuristic,
A* examines each state at most once, yielding O(3^N) visits and
O(3^N · N) total work.  BFS shares the same worst-case bounds
but lacks heuristic pruning, resulting in a larger constant
factor in practice.

The branching factor is at most 2P = 6 (each peg's top disk can
move to 2 other pegs, and at most P = 3 pegs have disks).  In
practice the effective branching factor is significantly smaller
due to the size constraint.
"""

import heapq
from collections import Counter, deque
from typing import Dict, List, Optional, Tuple

# ────────────────────────────────────────────────────────
# Type Aliases
# ────────────────────────────────────────────────────────
Disk  = Tuple[int, str]              # (size, color)
Peg   = Tuple[Disk, ...]             # bottom → top
State = Tuple[Peg, Peg, Peg]         # 3 pegs
Move  = Dict[str, int]               # {"source": 0–2, "dest": 0–2}


# ────────────────────────────────────────────────────────
# State Helpers
# ────────────────────────────────────────────────────────

def _freeze(pegs: list) -> State:
    """Convert mutable peg lists to an immutable, hashable State."""
    return tuple(tuple(p) for p in pegs)


def _successors(state: State) -> List[Tuple[State, Move]]:
    """Return every (next_state, move) reachable by a single legal transfer."""
    result: List[Tuple[State, Move]] = []
    for src in range(3):
        if not state[src]:
            continue
        disk = state[src][-1]
        for dst in range(3):
            if dst == src:
                continue
            if state[dst] and state[dst][-1][0] < disk[0]:
                continue                             # size constraint
            new = [list(p) for p in state]
            new[src] = new[src][:-1]
            new[dst] = new[dst] + [disk]
            result.append((_freeze(new), {"source": src, "dest": dst}))
    return result


# ────────────────────────────────────────────────────────
# Heuristic
# ────────────────────────────────────────────────────────

def _heuristic(state: State, goal: State) -> int:
    """Count disks not yet in their goal (peg, position).  Admissible."""
    goal_map: Dict[Disk, Tuple[int, int]] = {}
    for pi, peg in enumerate(goal):
        for si, disk in enumerate(peg):
            goal_map[disk] = (pi, si)
    h = 0
    for pi, peg in enumerate(state):
        for si, disk in enumerate(peg):
            if (pi, si) != goal_map.get(disk, (-1, -1)):
                h += 1
    return h


# ────────────────────────────────────────────────────────
# A* Search
# ────────────────────────────────────────────────────────

def _solve_astar(initial: State, goal: State) -> Optional[List[Move]]:
    """Return the shortest move sequence from *initial* to *goal*, or None."""
    if initial == goal:
        return []
    counter = 0
    h0 = _heuristic(initial, goal)
    heap: list = [(h0, counter, initial, [])]        # (f, tiebreak, state, path)
    best_g: Dict[State, int] = {initial: 0}

    while heap:
        _f, _, cur, path = heapq.heappop(heap)
        g = len(path)
        if g > best_g.get(cur, float('inf')):
            continue
        if cur == goal:
            return path
        for nxt, mv in _successors(cur):
            ng = g + 1
            if ng < best_g.get(nxt, float('inf')):
                best_g[nxt] = ng
                counter += 1
                heapq.heappush(
                    heap,
                    (ng + _heuristic(nxt, goal), counter, nxt, path + [mv]),
                )
    return None


# ────────────────────────────────────────────────────────
# Breadth-First Search
# ────────────────────────────────────────────────────────

def _solve_bfs(initial: State, goal: State) -> Optional[List[Move]]:
    """BFS — guaranteed shortest path, no heuristic."""
    if initial == goal:
        return []
    visited = {initial}
    queue = deque([(initial, [])])
    while queue:
        cur, path = queue.popleft()
        for nxt, mv in _successors(cur):
            if nxt in visited:
                continue
            visited.add(nxt)
            np_ = path + [mv]
            if nxt == goal:
                return np_
            queue.append((nxt, np_))
    return None


# ────────────────────────────────────────────────────────
# Goal Construction from Target Colour Sequence
# ────────────────────────────────────────────────────────

def _build_goal(all_disks: List[Disk], target_colors: List[str]) -> Optional[State]:
    """
    Construct the goal state: all disks on Peg C, largest at bottom,
    with their colour sequence (top → bottom) matching *target_colors*.

    The target_colors list is specified **top → bottom** on Peg C.
    Peg C stores disks bottom → top, so the bottom disk has the
    largest size.

    Mapping algorithm:
      - target_colors[0] corresponds to the **smallest** disk (top of Peg C)
      - target_colors[N-1] corresponds to the **largest** disk (bottom of Peg C)

    We must assign each position in the target to an actual disk of
    the correct colour.  Because disks have *unique sizes* and *fixed
    colours*, we need to check that a valid assignment exists.

    Returns None if the colour multiset does not match (unsolvable).
    """
    n = len(all_disks)
    if len(target_colors) != n:
        return None

    # Check colour multiset compatibility
    actual_counts = Counter(d[1] for d in all_disks)
    target_counts = Counter(target_colors)
    if actual_counts != target_counts:
        return None

    # Group disks by colour, sort each group by size
    by_color: Dict[str, List[Disk]] = {}
    for d in all_disks:
        by_color.setdefault(d[1], []).append(d)
    for color in by_color:
        by_color[color].sort(key=lambda d: d[0])  # ascending size

    # Assign disks to target positions.
    # target_colors[0] = top (smallest possible), target_colors[n-1] = bottom (largest possible)
    # Peg C stores bottom → top, so we build the peg bottom → top.
    # Bottom → top on Peg C = target_colors reversed.
    #
    # For each colour group, we must assign disks to positions such that
    # overall size ordering is maintained (strictly ascending bottom → top,
    # i.e. strictly descending from position 0 to position n-1 in target_colors).
    #
    # We use a greedy approach: iterate positions from bottom to top (largest
    # required size to smallest).  For each position, pick the largest
    # remaining disk of the required colour.  Then verify strict size ordering.

    # Positions: index 0 = top (smallest), index n-1 = bottom (largest)
    # Build bottom → top for Peg C:
    #   peg_c[0] = bottom-most disk  → target_colors[n-1]
    #   peg_c[n-1] = top-most disk   → target_colors[0]

    color_pools: Dict[str, List[Disk]] = {}
    for color in by_color:
        color_pools[color] = list(by_color[color])  # ascending size, copy

    peg_c: List[Disk] = []
    # Bottom → top means we want decreasing sizes.
    # Iterate from bottom (target_colors[n-1]) to top (target_colors[0]).
    for i in range(n - 1, -1, -1):
        color = target_colors[i]
        pool = color_pools.get(color, [])
        if not pool:
            return None  # shouldn't happen if multiset matches, but safety
        # Pick the largest remaining disk of this colour for this position
        disk = pool.pop()  # largest because sorted ascending, .pop() gives last
        peg_c.append(disk)

    # Verify strict descending size from bottom → top
    for i in range(len(peg_c) - 1):
        if peg_c[i][0] <= peg_c[i + 1][0]:
            # Size ordering violated — this target arrangement is infeasible
            # with the available disks
            return None

    return ((), (), tuple(peg_c))


# ────────────────────────────────────────────────────────
# Public API
# ────────────────────────────────────────────────────────

def solve(pegs_data: list, target_colors: list, algorithm: str = "astar") -> dict:
    """
    Entry point called from Django views.

    Parameters
    ----------
    pegs_data      : [[{"size": int, "color": str}, …], …]
                     3 peg lists, each bottom → top.
    target_colors  : [str, …]
                     Expected top-to-bottom color sequence on Peg C.
    algorithm      : "astar" | "bfs"

    Returns
    -------
    dict  {"error": str|None, "moves": list|None}
    """
    # ── Parse input ─────────────────────────────────────
    initial: State = tuple(
        tuple((d["size"], d["color"]) for d in peg)
        for peg in pegs_data
    )
    all_disks: List[Disk] = [disk for peg in initial for disk in peg]

    # ── Build goal state from target colour arrangement ─
    goal = _build_goal(all_disks, list(target_colors))
    if goal is None:
        return {
            "error": (
                "Target colour arrangement is infeasible. "
                "The colour counts must match the actual disks, and "
                "the arrangement must be achievable while maintaining "
                "size ordering (larger disks below smaller ones)."
            ),
            "moves": None,
        }

    # ── Solve ───────────────────────────────────────────
    fn = _solve_astar if algorithm == "astar" else _solve_bfs
    try:
        moves = fn(initial, goal)
    except Exception as exc:
        return {"error": f"Solver exception: {exc}", "moves": None}

    if moves is None:
        return {"error": "No solution exists for this configuration.", "moves": None}

    return {"error": None, "moves": moves}

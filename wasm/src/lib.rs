use std::collections::BinaryHeap;
use std::cmp::Ordering;
use wasm_bindgen::prelude::*;

const WALL: u8 = 1;

// Dijkstra heap entry — ordered by cost ascending.
#[derive(Copy, Clone, PartialEq, Eq)]
struct Node {
    cost: u32,
    idx: u32,
}

impl Ord for Node {
    fn cmp(&self, other: &Self) -> Ordering {
        other.cost.cmp(&self.cost).then_with(|| self.idx.cmp(&other.idx))
    }
}
impl PartialOrd for Node {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) }
}

// A* heap entry — ordered by f ascending, then by g descending (prefer closer to goal).
#[derive(Copy, Clone, PartialEq, Eq)]
struct ANode {
    f: u32,
    g: u32,
    idx: u32,
}

impl Ord for ANode {
    fn cmp(&self, other: &Self) -> Ordering {
        // BinaryHeap is max-heap; invert for min behavior on f, then prefer larger g.
        other.f.cmp(&self.f)
            .then_with(|| self.g.cmp(&other.g))
            .then_with(|| self.idx.cmp(&other.idx))
    }
}
impl PartialOrd for ANode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) }
}

#[wasm_bindgen]
pub struct DijkstraResult {
    pub nodes_explored: u32,
    pub path_length: u32,
    pub found: bool,
    visited: Vec<u32>,
    path: Vec<u32>,
}

#[wasm_bindgen]
impl DijkstraResult {
    #[wasm_bindgen(getter)]
    pub fn visited(&self) -> Vec<u32> { self.visited.clone() }
    #[wasm_bindgen(getter)]
    pub fn path(&self) -> Vec<u32> { self.path.clone() }
}

fn reconstruct(prev: &[i32], end: usize, found: bool) -> Vec<u32> {
    if !found { return Vec::new(); }
    let mut path = Vec::new();
    let mut cur = end as i32;
    while cur != -1 {
        path.push(cur as u32);
        cur = prev[cur as usize];
    }
    path.reverse();
    path
}

#[wasm_bindgen]
pub fn dijkstra(grid: &[u8], n: u32, start: u32, end: u32) -> DijkstraResult {
    let n = n as usize;
    let total = n * n;
    let start = start as usize;
    let end = end as usize;

    let mut dist: Vec<u32> = vec![u32::MAX; total];
    let mut prev: Vec<i32> = vec![-1; total];
    let mut visited_order: Vec<u32> = Vec::with_capacity(total / 2);
    let mut closed: Vec<bool> = vec![false; total];

    let mut heap: BinaryHeap<Node> = BinaryHeap::new();
    dist[start] = 0;
    heap.push(Node { cost: 0, idx: start as u32 });

    let mut found = false;

    while let Some(Node { cost, idx }) = heap.pop() {
        let i = idx as usize;
        if closed[i] { continue; }
        closed[i] = true;
        visited_order.push(idx);

        if i == end { found = true; break; }
        if cost > dist[i] { continue; }

        let r = i / n;
        let c = i % n;
        let nd = cost + 1;

        if r > 0 {
            let ni = i - n;
            if grid[ni] != WALL && nd < dist[ni] {
                dist[ni] = nd; prev[ni] = i as i32;
                heap.push(Node { cost: nd, idx: ni as u32 });
            }
        }
        if r + 1 < n {
            let ni = i + n;
            if grid[ni] != WALL && nd < dist[ni] {
                dist[ni] = nd; prev[ni] = i as i32;
                heap.push(Node { cost: nd, idx: ni as u32 });
            }
        }
        if c > 0 {
            let ni = i - 1;
            if grid[ni] != WALL && nd < dist[ni] {
                dist[ni] = nd; prev[ni] = i as i32;
                heap.push(Node { cost: nd, idx: ni as u32 });
            }
        }
        if c + 1 < n {
            let ni = i + 1;
            if grid[ni] != WALL && nd < dist[ni] {
                dist[ni] = nd; prev[ni] = i as i32;
                heap.push(Node { cost: nd, idx: ni as u32 });
            }
        }
    }

    let path = reconstruct(&prev, end, found);
    DijkstraResult {
        nodes_explored: visited_order.len() as u32,
        path_length: path.len() as u32,
        found,
        visited: visited_order,
        path,
    }
}

#[inline]
fn manhattan(idx: usize, n: usize, er: usize, ec: usize) -> u32 {
    let r = idx / n;
    let c = idx % n;
    let dr = if r > er { r - er } else { er - r };
    let dc = if c > ec { c - ec } else { ec - c };
    (dr + dc) as u32
}

#[wasm_bindgen]
pub fn astar(grid: &[u8], n: u32, start: u32, end: u32) -> DijkstraResult {
    let n = n as usize;
    let total = n * n;
    let start = start as usize;
    let end = end as usize;
    let er = end / n;
    let ec = end % n;

    let mut g_score: Vec<u32> = vec![u32::MAX; total];
    let mut prev: Vec<i32> = vec![-1; total];
    let mut visited_order: Vec<u32> = Vec::with_capacity(total / 2);
    let mut closed: Vec<bool> = vec![false; total];

    let mut heap: BinaryHeap<ANode> = BinaryHeap::new();
    g_score[start] = 0;
    heap.push(ANode { f: manhattan(start, n, er, ec), g: 0, idx: start as u32 });

    let mut found = false;

    while let Some(ANode { f: _, g: _, idx }) = heap.pop() {
        let i = idx as usize;
        if closed[i] { continue; }
        closed[i] = true;
        visited_order.push(idx);

        if i == end { found = true; break; }

        let r = i / n;
        let c = i % n;
        let ng = g_score[i] + 1;

        let mut try_n = |ni: usize, prev: &mut [i32], g_score: &mut [u32], heap: &mut BinaryHeap<ANode>| {
            if grid[ni] == WALL { return; }
            if ng < g_score[ni] {
                g_score[ni] = ng;
                prev[ni] = i as i32;
                let f = ng + manhattan(ni, n, er, ec);
                heap.push(ANode { f, g: ng, idx: ni as u32 });
            }
        };

        if r > 0 { try_n(i - n, &mut prev, &mut g_score, &mut heap); }
        if r + 1 < n { try_n(i + n, &mut prev, &mut g_score, &mut heap); }
        if c > 0 { try_n(i - 1, &mut prev, &mut g_score, &mut heap); }
        if c + 1 < n { try_n(i + 1, &mut prev, &mut g_score, &mut heap); }
    }

    let path = reconstruct(&prev, end, found);
    DijkstraResult {
        nodes_explored: visited_order.len() as u32,
        path_length: path.len() as u32,
        found,
        visited: visited_order,
        path,
    }
}

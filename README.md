# Game Experiments - Thermo Reactor

A hexagonal grid simulation game where you manage energy sources, heat sinks, and shields to stabilize a thermal reactor.

## 🎮 Play Online

[Click here to play the generated HTML build](https://olive-bethina-28.tiiny.site/)

## 🚀 Getting Started

### Prerequisites

- Node.js (v16+)

### Installation

```bash
npm install
```

### Development

Start the local dev server:

```bash
npm run dev
```

## 🏗️ Building

### 1. Web Version (Single File)

Everything is bundled into a single `index.html` file, perfect for sharing.

```bash
npm run purehtml
```

Output: `docs/index.html`

### 2. Desktop Application (Windows/Mac/Linux)

Built using Tauri. Requires Rust installed.

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/`

## 🕹️ Controls

- **Click**: Select cell / Place entity (if tool selected)
- **1-6**: Assign Group ID to hovered entity
- **Left Sidebar**: Manage global parameters, source activation, and source lists.
- **Right Sidebar**: Palette tools (Source, Sink, Shield, Probe), Save/Load/Clear.

## 🛠️ Tech Stack

- **Languages**: TypeScript, Rust (Tauri backend)
- **Framework**: Vite, Vanilla DOM (no UI framework)
- **Library**: Custom HexLib for coordinate systems

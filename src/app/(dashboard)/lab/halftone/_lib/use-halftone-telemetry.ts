"use client";

import { useSyncExternalStore } from "react";
import type { PanelKey } from "./constants";

type Listener = () => void;

type FpsEntry = { fps: number; gpuMs: number };

type TelemetryStore = {
  fps: Record<PanelKey, FpsEntry>;
  histogram: Uint32Array | null;
  fpsVersion: number;
  histVersion: number;
};

const EMPTY_HIST = null;

const store: TelemetryStore = {
  fps: {
    A: { fps: 0, gpuMs: 0 },
    B: { fps: 0, gpuMs: 0 },
    C: { fps: 0, gpuMs: 0 },
    D: { fps: 0, gpuMs: 0 },
  },
  histogram: EMPTY_HIST,
  fpsVersion: 0,
  histVersion: 0,
};

const fpsListeners = new Set<Listener>();
const histListeners = new Set<Listener>();

const lastPublishMs: Record<PanelKey, number> = { A: 0, B: 0, C: 0, D: 0 };
const PUBLISH_INTERVAL_MS = 1000;

function notify(listeners: Set<Listener>) {
  for (const l of listeners) l();
}

export function publishFps(key: PanelKey, fps: number, gpuMs: number) {
  const now = performance.now();
  if (now - lastPublishMs[key] < PUBLISH_INTERVAL_MS) return;
  lastPublishMs[key] = now;
  store.fps[key] = { fps, gpuMs };
  store.fpsVersion++;
  notify(fpsListeners);
}

export function publishHistogram(hist: Uint32Array) {
  store.histogram = hist;
  store.histVersion++;
  notify(histListeners);
}

function subscribeFps(listener: Listener): () => void {
  fpsListeners.add(listener);
  return () => {
    fpsListeners.delete(listener);
  };
}

function subscribeHist(listener: Listener): () => void {
  histListeners.add(listener);
  return () => {
    histListeners.delete(listener);
  };
}

function getFpsSnapshot(): FpsEntry {
  // Sentinel referenced via fpsVersion so useSyncExternalStore refreshes;
  // actual read happens via useFpsEntry below.
  void store.fpsVersion;
  return store.fps.A;
}

function getHistSnapshot(): Uint32Array | null {
  void store.histVersion;
  return store.histogram;
}

export function useFpsEntry(key: PanelKey): FpsEntry {
  useSyncExternalStore(subscribeFps, getFpsSnapshot, getFpsSnapshot);
  return store.fps[key];
}

export function useHistogram(): Uint32Array | null {
  return useSyncExternalStore(subscribeHist, getHistSnapshot, () => null);
}

export function resetTelemetry() {
  for (const k of ["A", "B", "C", "D"] as PanelKey[]) {
    store.fps[k] = { fps: 0, gpuMs: 0 };
    lastPublishMs[k] = 0;
  }
  store.histogram = EMPTY_HIST;
  store.fpsVersion++;
  store.histVersion++;
  notify(fpsListeners);
  notify(histListeners);
}

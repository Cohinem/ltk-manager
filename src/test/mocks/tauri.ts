import { vi } from "vitest";

export const mockInvoke = vi.fn();
export const mockListen = vi.fn(() => Promise.resolve(vi.fn()));

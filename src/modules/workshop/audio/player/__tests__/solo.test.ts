import { describe, expect, it } from "vitest";

import { playSolo, toggleSolo } from "../solo";
import { openFakeChannel } from "./fakeChannel";

describe("toggleSolo", () => {
  it("stops the voice of the first key when a second key plays", () => {
    const channel = openFakeChannel();

    toggleSolo(channel, "10322914", ["first"]);
    toggleSolo(channel, "11094382", ["second"]);

    expect([...channel.state().playing]).toEqual(["11094382"]);
  });

  it("stops a key that plays", () => {
    const channel = openFakeChannel();

    toggleSolo(channel, "10322914", ["first"]);
    toggleSolo(channel, "10322914", ["first"]);

    expect(channel.state().playing.size).toBe(0);
  });
});

describe("playSolo", () => {
  it("resumes a paused channel", () => {
    const channel = openFakeChannel();
    channel.pause();

    playSolo(channel, "row", ["media"]);

    expect(channel.state().paused).toBe(false);
    expect([...channel.state().playing]).toEqual(["row"]);
  });
});

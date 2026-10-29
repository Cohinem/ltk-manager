import { describe, expect, it } from "vitest";

import { openFakeChannel, playedUrls } from "../../player/__tests__/fakeChannel";
import { createWaveformSync, seekKeyTime, type WaveformSubject } from "../waveformSync";

const subject: WaveformSubject = { key: "7", urls: ["sound-7"] };

function setup(duration = 4) {
  const channel = openFakeChannel();
  return { channel, sync: createWaveformSync(channel, subject, duration) };
}

describe("createWaveformSync", () => {
  it("returns the position of the subject on the first frame, then null until it moves", () => {
    const { channel, sync } = setup();
    channel.play("7", ["sound-7"], "once", 1.5);

    expect(sync.frame()).toBe(1.5);
    expect(sync.frame()).toBeNull();

    channel.seek("7", 2);
    expect(sync.frame()).toBe(2);
  });

  it("returns the start while the subject does not play", () => {
    const { channel, sync } = setup();
    channel.play("7", ["sound-7"], "once", 3);
    channel.stop("7");

    expect(sync.time()).toBe(0);
    expect(sync.status()).toBe("stopped");
  });

  it("plays the subject from the seeked time if it does not play", () => {
    const { channel, sync } = setup();
    const before = playedUrls.length;

    sync.seek(2.5);

    expect(channel.state().playing.has("7")).toBe(true);
    expect(channel.position("7")).toBe(2.5);
    expect(playedUrls.slice(before)).toEqual(["sound-7"]);
  });

  it("stops another key of the channel before it plays the subject", () => {
    const { channel, sync } = setup();
    channel.play("9", ["sound-9"]);

    sync.seek(1);

    expect([...channel.state().playing]).toEqual(["7"]);
  });

  it("resumes a paused channel before it plays the subject", () => {
    const { channel, sync } = setup();
    channel.pause();

    sync.seek(1);

    expect(channel.state().paused).toBe(false);
    expect(sync.status()).toBe("playing");
  });

  it("moves the subject's voices without a new play while it plays", () => {
    const { channel, sync } = setup();
    channel.play("7", ["sound-7"]);
    const before = playedUrls.length;

    sync.seek(3);

    expect(channel.position("7")).toBe(3);
    expect(playedUrls.length).toBe(before);
  });

  it("keeps a paused subject paused when it seeks", () => {
    const { channel, sync } = setup();
    channel.play("7", ["sound-7"]);
    channel.pause();

    sync.seek(1);

    expect(sync.status()).toBe("paused");
    expect(channel.position("7")).toBe(1);
  });

  it("clamps a seek to the media", () => {
    const { channel, sync } = setup(4);

    sync.seekFraction(1.5);
    expect(channel.position("7")).toBe(4);

    sync.seekFraction(-0.25);
    expect(channel.position("7")).toBe(0);
  });

  it("returns no frame during a drag and seeks to the fraction where the drag ends", () => {
    const { channel, sync } = setup(4);
    channel.play("7", ["sound-7"], "once", 1);
    sync.frame();

    sync.dragStart();
    channel.seek("7", 1.25);
    expect(sync.frame()).toBeNull();

    sync.dragEnd(0.75);
    expect(channel.position("7")).toBe(3);
    expect(sync.frame()).toBe(3);
  });

  it("plays a stopped subject from the start, pauses it, then resumes it on toggle", () => {
    const { channel, sync } = setup();

    sync.toggle();
    expect(sync.status()).toBe("playing");
    expect(channel.position("7")).toBe(0);

    sync.toggle();
    expect(sync.status()).toBe("paused");

    sync.toggle();
    expect(sync.status()).toBe("playing");
  });
});

describe("seekKeyTime", () => {
  it("steps a twentieth of the media on an arrow key", () => {
    expect(seekKeyTime("ArrowRight", 1, 4)).toBe(1.2);
    expect(seekKeyTime("ArrowLeft", 1, 4)).toBe(0.8);
  });

  it("steps a quarter of the media on a page key", () => {
    expect(seekKeyTime("PageUp", 1, 4)).toBe(2);
    expect(seekKeyTime("PageDown", 1, 4)).toBe(0);
  });

  it("returns the start on Home and the end on End", () => {
    expect(seekKeyTime("Home", 2, 4)).toBe(0);
    expect(seekKeyTime("End", 2, 4)).toBe(4);
  });

  it("clamps a step to the media", () => {
    expect(seekKeyTime("ArrowRight", 3.9, 4)).toBe(4);
    expect(seekKeyTime("PageDown", 0.5, 4)).toBe(0);
  });

  it("returns null for a key that does not seek", () => {
    expect(seekKeyTime("Enter", 1, 4)).toBeNull();
  });
});

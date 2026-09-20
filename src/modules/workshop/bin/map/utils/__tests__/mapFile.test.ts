import { mapPathOfFile } from "../mapFile";

describe("mapPathOfFile", () => {
  it("gives back the map either of its files belongs to", () => {
    expect(mapPathOfFile("data/maps/mapgeometry/map11/base_srx.mapgeo")).toBe(
      "maps/mapgeometry/map11/base_srx",
    );
    expect(mapPathOfFile("data/maps/mapgeometry/map11/base_srx.materials.bin")).toBe(
      "maps/mapgeometry/map11/base_srx",
    );
  });

  it("reads past the archive or the layer the file sits in, whatever its case", () => {
    expect(
      mapPathOfFile(
        "DATA/FINAL/Maps/Shipping/Map11.wad.client/data/Maps/MapGeometry/Map11/Bloom.mapgeo",
      ),
    ).toBe("maps/mapgeometry/map11/bloom");
    expect(
      mapPathOfFile("Map11.wad.client\\data\\maps\\mapgeometry\\sr\\npe_1.materials.bin"),
    ).toBe("maps/mapgeometry/sr/npe_1");
  });

  it("answers none for another file, a file under no data directory and a chunk nothing names", () => {
    expect(mapPathOfFile("data/characters/annie/skins/skin0.bin")).toBeNull();
    expect(mapPathOfFile("loose/base_srx.mapgeo")).toBeNull();
    expect(mapPathOfFile(undefined)).toBeNull();
  });
});

export const homeKeys = {
  all: ["home"] as const,
  announcements: () => [...homeKeys.all, "announcements"] as const,
  notices: () => [...homeKeys.all, "notices"] as const,
};

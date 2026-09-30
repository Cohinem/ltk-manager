import { commandNames as app } from "@/lib/bindings";
import { commandNames as appUpdate } from "@/lib/ipc/appUpdate";
import { commandNames as bin } from "@/lib/ipc/bin";
import { commandNames as game } from "@/lib/ipc/game";
import { commandNames as library } from "@/lib/ipc/library";
import { commandNames as objects } from "@/lib/ipc/objects";
import { commandNames as workshop } from "@/lib/ipc/workshop";

/**
 * The name each command is invoked under, by service and generated function, for a test to
 * match `invoke` calls on. Generated beside the commands (ADR-0059), so a renamed or moved
 * command fails the typecheck.
 */
export const commandNames = { app, appUpdate, bin, game, library, objects, workshop } as const;

import { Button } from "./Button";
import type { GalleryEntry } from "./galleryEntry";
import { useToast } from "./Toast";

function Types() {
  const toast = useToast();

  return (
    <>
      <Button variant="outline" onClick={() => toast.info("Library scanned", "42 mods found.")}>
        Info
      </Button>
      <Button variant="outline" onClick={() => toast.success("Mod installed", "Fiora VFX")}>
        Success
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.warning("Two mods edit the same file", "The later one wins.")}
      >
        Warning
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.error("Install failed", "The archive could not be read.")}
      >
        Error
      </Button>
    </>
  );
}

function Actions() {
  const toast = useToast();

  return (
    <Button
      variant="outline"
      onClick={() =>
        toast.toast({
          title: "Mod removed",
          description: "Fiora VFX left the library.",
          actions: [
            { label: "Undo", onClick: () => {} },
            { label: "Open folder", onClick: () => {} },
          ],
        })
      }
    >
      With actions
    </Button>
  );
}

function Task() {
  const toast = useToast();

  return (
    <Button
      variant="outline"
      onClick={() => {
        const task = toast.task("Checking mods", "Starting", {
          label: "Stop",
          onClick: () => {},
        });
        task.report(40, "17 of 42");
        window.setTimeout(task.close, 4000);
      }}
    >
      Running task
    </Button>
  );
}

const entry: GalleryEntry = {
  name: "Toast",
  family: "feedback",
  cases: [
    { name: "Types", render: () => <Types /> },
    { name: "Actions", render: () => <Actions /> },
    { name: "Task", render: () => <Task /> },
  ],
};

export default entry;

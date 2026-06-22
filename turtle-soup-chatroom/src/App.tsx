import { useMemo, useState } from "react";
import { HomePage } from "./components/HomePage";
import { PuzzleDetail } from "./components/PuzzleDetail";
import { seedPuzzles } from "./data/seedPuzzles";
import type { Puzzle, RoomState } from "./shared/types";

type View =
  | { name: "home" }
  | { name: "detail"; puzzle: Puzzle }
  | { name: "room"; room: RoomState; playerId: string };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const randomPuzzle = useMemo(
    () => () => {
      const puzzle = seedPuzzles[Math.floor(Math.random() * seedPuzzles.length)];
      setView({ name: "detail", puzzle });
    },
    []
  );

  if (view.name === "detail") {
    return (
      <PuzzleDetail
        puzzle={view.puzzle}
        onBack={() => setView({ name: "home" })}
        onStart={() => alert("房间功能将在下一任务接入")}
      />
    );
  }

  if (view.name === "room") {
    return <div />;
  }

  return (
    <HomePage
      onOpenPuzzle={(puzzle) => setView({ name: "detail", puzzle })}
      onRandomPuzzle={randomPuzzle}
    />
  );
}

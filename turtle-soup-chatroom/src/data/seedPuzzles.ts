import type { Puzzle } from "../shared/types";

export const seedPuzzles: Puzzle[] = [
  {
    id: "rain-platform",
    title: "雨夜站台",
    surface: "深夜的站台空无一人，女孩却向空气道谢，然后消失了。",
    truth: "女孩正在参加一次沉浸式告别仪式。她感谢的是耳机里播放的父亲生前录音，随后进入后台通道离开，并不是真的消失。",
    difficulty: "medium",
    tags: ["悬疑", "温情", "误导"],
    author: "初版题库",
    rating: 8.2,
    plays: 42,
    createdAt: "2026-06-01"
  },
  {
    id: "cold-cup",
    title: "冷掉的水",
    surface: "男人喝了一口冷水后立刻报警。",
    truth: "他离家前倒的是热水。杯子变冷且位置没变，说明有人进入房间并替换了杯中液体，他意识到独居住所被入侵。",
    difficulty: "easy",
    tags: ["本格", "生活", "入门"],
    author: "初版题库",
    rating: 7.1,
    plays: 88,
    createdAt: "2026-06-10"
  },
  {
    id: "silent-elevator",
    title: "安静电梯",
    surface: "电梯里所有人都沉默着，门开后，只有一个人尖叫起来。",
    truth: "那个人是电梯维修员。他刚修好一台本应停运的电梯，却看到里面站满了刚刚失联楼层的人，意识到事故并未结束。",
    difficulty: "hard",
    tags: ["恐怖", "悬疑", "建筑"],
    author: "初版题库",
    rating: 8.6,
    plays: 31,
    createdAt: "2026-06-12"
  }
];

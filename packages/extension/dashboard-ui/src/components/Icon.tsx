// Shared semantic icon set — Phosphor duotone, the same style as the sidebar
// (NavSidebar uses @phosphor-icons/react weight="duotone"). Use these instead of
// emoji so a concept ("active course", "verified", "streak") always renders the
// same icon everywhere. Duotone weight is baked in; pass size/className/color.
import {
  GraduationCap, ChatCircleDots, Books, BookOpen, Flame, Clock,
  SealCheck, CheckCircle, Circle, Lock, CaretRight, CaretLeft, ArrowRight,
  Medal, Trophy, Lightbulb, Code, Wrench, Question, ArrowsClockwise, Play,
  Barbell, ForkKnife, Carrot, Bandaids, PersonSimpleRun, Snowflake,
  CalendarBlank, PuzzlePiece, Cloud, HardDrives, GridFour, List, Users,
  Package, NotePencil, Brain, Confetti,
  MagnifyingGlass, ShieldCheck, Flask, Ruler, ClipboardText, Target, Hammer,
  PencilLine, ChalkboardTeacher, Robot, Bell, Paperclip, Notepad,
  FolderSimple, GitBranch, Globe, Palette, Database, Monitor, FileText, GearSix,
  PushPin, Rocket, Sparkle, GithubLogo, Bug, CreditCard, User, Lightning, Warning,
  type IconWeight,
} from '@phosphor-icons/react';

interface IconProps { size?: number; className?: string; weight?: IconWeight }
const mk = (Ph: typeof GraduationCap) =>
  ({ size = 16, className, weight = 'duotone' }: IconProps) => <Ph size={size} weight={weight} className={className} />;

/** Semantic icons — one source of truth so the same concept looks identical
 *  across Learning, Health, Library and the rest. */
export const Icon = {
  course: mk(GraduationCap),     // a course / learning / certificate
  certificate: mk(GraduationCap),
  chat: mk(ChatCircleDots),      // talk to Ava
  books: mk(Books),              // build / library
  book: mk(BookOpen),            // a concept lesson
  streak: mk(Flame),             // streak 🔥
  clock: mk(Clock),              // time / "needs a refresh"
  verified: mk(SealCheck),       // earned / verified ✓
  done: mk(CheckCircle),         // completed ✓
  todo: mk(Circle),              // not started ○
  locked: mk(Lock),              // 🔒
  current: mk(CaretRight),       // "you are here" →
  next: mk(ArrowRight),          // continue / forward →
  collapse: mk(CaretRight),      // hide a side panel ›
  expand: mk(CaretLeft),         // show a side panel ‹
  achievement: mk(Medal),        // earned badge 🏅
  star: mk(Trophy),              // milestone ⭐
  idea: mk(Lightbulb),           // explain 💡
  code: mk(Code),                // exercise 💻
  project: mk(Wrench),           // project 🛠
  quiz: mk(Question),            // quiz ❓
  review: mk(ArrowsClockwise),   // recap / review 🔄
  play: mk(Play),                // start / launch ▶
  fitness: mk(Barbell),          // workout / fitness 🏋
  meal: mk(ForkKnife),           // meal / cooking 🍳
  nutrition: mk(Carrot),         // nutrition / food 🥗
  injury: mk(Bandaids),          // injury / recovery 🩹
  run: mk(PersonSimpleRun),      // exercise / movement 💪
  frozen: mk(Snowflake),         // freezer / frozen ❄️🧊
  calendar: mk(CalendarBlank),   // calendar / week 🗓️
  puzzle: mk(PuzzlePiece),       // profile fill / field 🧩
  cloud: mk(Cloud),              // cloud storage ☁
  local: mk(HardDrives),         // local storage 💾
  grid: mk(GridFour),            // grid view ▦
  list: mk(List),                // list view ☰
  users: mk(Users),              // learners / people 👥
  package: mk(Package),          // module / package 📦
  note: mk(NotePencil),          // journal / note 📓📝
  brain: mk(Brain),              // memory 🧠
  party: mk(Confetti),           // celebrate / done 🎉
  bell: mk(Bell),                // reminder 🔔
  paperclip: mk(Paperclip),      // attachment / context 📎
  notepad: mk(Notepad),          // task note 🗒️
  // Persona avatars
  scout: mk(MagnifyingGlass),
  shield: mk(ShieldCheck),
  flask: mk(Flask),
  ruler: mk(Ruler),
  clipboard: mk(ClipboardText),
  target: mk(Target),
  hammer: mk(Hammer),
  pencil: mk(PencilLine),
  teacher: mk(ChalkboardTeacher),
  robot: mk(Robot),
  // Settings categories / support / onboarding / misc
  folder: mk(FolderSimple),      // file ops 📁
  git: mk(GitBranch),            // git 🔀
  globe: mk(Globe),              // web 🌐
  palette: mk(Palette),          // media / create 🎨
  database: mk(Database),        // database 🗄️
  monitor: mk(Monitor),          // system / desktop 🖥️
  file: mk(FileText),            // documents 📄📘
  gear: mk(GearSix),             // settings ⚙
  pin: mk(PushPin),              // pinned 📌
  rocket: mk(Rocket),            // launch / ready 🚀
  sparkle: mk(Sparkle),          // feature / new ✨
  github: mk(GithubLogo),        // github 🐙
  bug: mk(Bug),                  // bug report 🐞
  card: mk(CreditCard),          // billing 💳
  user: mk(User),                // account 👤
  lightning: mk(Lightning),      // active / energy ⚡
  warning: mk(Warning),          // caution ⚠️
};

export type IconKey = keyof typeof Icon;

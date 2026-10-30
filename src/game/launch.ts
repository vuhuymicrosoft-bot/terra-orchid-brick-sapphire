export interface Launch {
  role: "solo" | "host" | "guest";
  room: string;
  name: string;
  seedText: string;
  fresh: boolean;
}

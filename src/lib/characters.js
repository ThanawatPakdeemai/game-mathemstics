// ตัวละครจากโฟลเดอร์ racing-characters-15
const files = import.meta.glob("../../racing-characters-15/*.png", {
  eager: true,
  import: "default",
});

const THAI_NAMES = [
  "โปรเรเซอร์",
  "แชมป์โกคาร์ท",
  "สตรีทเรเซอร์",
  "โมโตครอส",
  "ซูเปอร์คาร์หรู",
  "สกู๊ตเตอร์ซิ่ง",
  "ไซด์คาร์รุ่นเก๋า",
  "ดริฟต์คิง",
  "โกคาร์ทจูเนียร์",
  "ซาเล้งซิ่ง",
  "ซูเปอร์ไบค์",
  "มอเตอร์ไซค์ส่งของ",
  "แรลลี่",
  "รถรักษ์โลก",
  "แชมป์ถ้วยทอง",
];

export const CHARACTERS = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([file, url], i) => ({
    id: i,
    url,
    name:
      THAI_NAMES[i] ||
      file
        .split("/")
        .pop()
        .replace(/^\d+-|\.png$/g, ""),
  }));

export const characterById = (id) =>
  id == null ? null : CHARACTERS[id] || null;

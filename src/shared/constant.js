export const LESSON_OPTIONS = Array.from({ length: 23 }, (_, i) => {
  const index = String(i + 1).padStart(2, "0");
  return { value: `lesson${index}`, label: `BUỔI ${index}` };
});

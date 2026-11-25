export const models = [
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra" },
  { id: "baidu/ernie-5.5-flash-preview:free", label: "ERNIE 5.5 Flash" },
  { id: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning" },
  { id: "inclusionai/ling-3.2-flash:free", label: "Ling 3.2 Flash" },
  { id: "nvidia/nemotron-3.5-super-vl:free", label: "Nemotron 3.5 Super VL" },
];

export function defaultModel(env) {
  const id = env.OPENROUTER_MODEL;
  if (!models.some((model) => model.id === id)) {
    throw new Error("OPENROUTER_MODEL is not on the allowlist");
  }
  return id;
}

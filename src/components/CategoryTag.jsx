import { CarFront, Home, Plane, Shapes } from "lucide-react";

const CATEGORY_ICONS = {
  Casa: Home,
  Carro: CarFront,
  Viagem: Plane,
  Outros: Shapes,
};

export function CategoryIcon({ category, size = 14 }) {
  const Icon = CATEGORY_ICONS[category] || Shapes;
  return <Icon aria-hidden="true" size={size} strokeWidth={2.2} />;
}

export function CategoryTag({ category }) {
  return (
    <span className="tag category-tag">
      <CategoryIcon category={category} />
      <span>{category}</span>
    </span>
  );
}

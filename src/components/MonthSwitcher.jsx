import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { MONTHS_PT } from "../config/forms";
import { shiftMonth } from "../domain/expenses";
import { formatMonthName } from "../utils/presentation";

export function ResourceMonthSwitcher({ selectedMonth, onMonthChange }) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => Number(selectedMonth?.split("-")[0]) || new Date().getFullYear());
  const containerRef = useRef(null);

  useEffect(() => {
    const year = Number(selectedMonth?.split("-")[0]);
    if (Number.isFinite(year)) setPickerYear(year);
  }, [selectedMonth]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsPickerOpen(false);
    }
    if (isPickerOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isPickerOpen]);

  function changeMonth(month) {
    onMonthChange(`${pickerYear}-${month}`);
    setIsPickerOpen(false);
  }

  return (
    <div className="resource-month-controls resource-month-picker" ref={containerRef}>
      <button className="icon-button" onClick={() => onMonthChange(shiftMonth(selectedMonth, -1))} title="Mês anterior" type="button">
        <ChevronLeft size={18} />
      </button>
      <button
        className={isPickerOpen ? "month-filter resource-month-picker-button active" : "month-filter resource-month-picker-button"}
        type="button"
        aria-expanded={isPickerOpen}
        aria-haspopup="dialog"
        onClick={() => setIsPickerOpen((current) => !current)}
      >
        <Calendar size={18} />
        <span>{formatMonthName(selectedMonth)}</span>
      </button>
      <button className="icon-button" onClick={() => onMonthChange(shiftMonth(selectedMonth, 1))} title="Próximo mês" type="button">
        <ChevronRight size={18} />
      </button>

      {isPickerOpen && (
        <div className="custom-month-dropdown resource-month-dropdown" role="dialog" aria-label="Escolher mês e ano">
          <div className="picker-year-header">
            <button className="year-nav-btn" type="button" onClick={() => setPickerYear((year) => year - 1)} title="Ano anterior">
              <ChevronLeft size={16} />
            </button>
            <span className="picker-year-display">{pickerYear}</span>
            <button className="year-nav-btn" type="button" onClick={() => setPickerYear((year) => year + 1)} title="Próximo ano">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="picker-months-grid">
            {MONTHS_PT.map((month) => {
              const monthValue = `${pickerYear}-${month.value}`;
              return (
                <button
                  className={selectedMonth === monthValue ? "picker-month-btn selected" : "picker-month-btn"}
                  key={month.value}
                  type="button"
                  onClick={() => changeMonth(month.value)}
                >
                  {month.short}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import "./top-menu.css";

export interface MenuAction {
  label: string;
  onClick: () => void;
  active?: boolean;
}

interface TopMenuProps {
  actions: MenuAction[];
}

export function TopMenu({ actions }: TopMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="top-menu">
      <div className={`top-menu-items ${open ? "is-open" : ""}`}>
        {actions.map((action) => (
          <button
            key={action.label}
            className={`top-menu-item ${action.active ? "is-active" : ""}`}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>
      <button
        className="top-menu-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        <span className={`hamburger ${open ? "is-open" : ""}`} />
      </button>
    </div>
  );
}

export default TopMenu;

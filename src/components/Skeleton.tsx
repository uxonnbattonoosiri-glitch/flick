import { motion } from 'motion/react';

const GROUPS = [
  [72, 54, 83],
  [61, 46, 68, 57, 74, 50],
];

/** index.html の中にあるスケルトンと同じ形。React に切り替わっても見た目が跳ねない */
export function Skeleton() {
  return (
    <motion.div
      className="skeleton"
      data-testid="skeleton"
      aria-busy="true"
      aria-label="読み込み中"
      exit={{ opacity: 0, filter: 'blur(10px)', scale: 0.985, transition: { duration: 0.2 } }}
    >
      <div className="sk sk-seg" />
      {GROUPS.map((group, g) => (
        <div key={g} className="sk-group">
          <div className="sk sk-label" />
          {group.map((w, i) => (
            <div key={i} className="sk-card glass">
              <span className="sk sk-dot" />
              <span className="sk sk-line" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      ))}
    </motion.div>
  );
}

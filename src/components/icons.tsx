/**
 * 圖示。
 *
 * 手寫一組而不是裝圖示套件：用到的就這十幾個，裝一整包只為了這些不划算。
 * 全部統一 24 格線稿、只描邊不填色、顏色吃 currentColor，這樣放在任何按鈕裡
 * 都會自動跟著文字顏色走。
 */

type IconProps = {
  /** 邊長（px）。預設 16，工具列與行內按鈕都用這個尺寸。 */
  size?: number;
  className?: string;
};

function Icon({ size = 16, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function IconHeading(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 4v16M18 4v16M6 12h12" />
    </Icon>
  );
}

export function IconBold(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 4h6.5a4 4 0 0 1 0 8H6zM6 12h7.5a4 4 0 0 1 0 8H6z" />
    </Icon>
  );
}

export function IconItalic(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 4h-9M14 20H5M15 4L9 20" />
    </Icon>
  );
}

export function IconList(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </Icon>
  );
}

export function IconListOrdered(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 6h11M10 12h11M10 18h11M4 4h1.5v5M3.5 9h3M3.5 15h3v2.5h-3V20h3" />
    </Icon>
  );
}

export function IconChecklist(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 6.5l2 2 3.5-3.5M3 17.5l2 2L8.5 16M12 6.5h9M12 17.5h9" />
    </Icon>
  );
}

export function IconQuote(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 5v14M10 8.5h10M10 15.5h7" />
    </Icon>
  );
}

export function IconLink(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.5 13.5a4.5 4.5 0 0 0 6.8.5l2.7-2.7a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.5" />
      <path d="M13.5 10.5a4.5 4.5 0 0 0-6.8-.5L4 12.7a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5" />
    </Icon>
  );
}

export function IconImage(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 15.5l-4.5-4.5L5 20" />
    </Icon>
  );
}

export function IconCode(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16 17l5-5-5-5M8 7l-5 5 5 5" />
    </Icon>
  );
}

export function IconTable(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M3 15h18M9.5 4v16" />
    </Icon>
  );
}

export function IconHistory(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.4 2" />
    </Icon>
  );
}

export function IconPin(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 16.5V22" />
      <path d="M8 3h8l-1 6.2 2.8 2.6a1 1 0 0 1-.7 1.7H6.9a1 1 0 0 1-.7-1.7L9 9.2z" />
    </Icon>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 6h17M9 6V4h6v2" />
      <path d="M18.5 6l-.9 13.1a2 2 0 0 1-2 1.9H8.4a2 2 0 0 1-2-1.9L5.5 6" />
    </Icon>
  );
}

export function IconHighlight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.5 3.5l6 6-8.5 8.5H6v-6z" />
      <path d="M3 21h18" />
    </Icon>
  );
}

export function IconCallout(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5v14" />
      <path d="M9 7h11M9 12h11M9 17h7" />
    </Icon>
  );
}

export function IconBook(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z" />
      <path d="M4 19.5A1.5 1.5 0 0 1 5.5 18H19v3H5.5A1.5 1.5 0 0 1 4 19.5z" />
    </Icon>
  );
}

export function IconOutline(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6h10M7 12h10M10 18h10" />
      <circle cx="4" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="7" cy="18" r="0.9" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconUndo(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9h11a5 5 0 0 1 0 10H9" />
      <path d="M8 5 4 9l4 4" />
    </Icon>
  );
}

export function IconRedo(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 9H9a5 5 0 0 0 0 10h6" />
      <path d="m16 5 4 4-4 4" />
    </Icon>
  );
}

export function IconDivider(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12h16" />
      <path d="M7 7h10M7 17h10" opacity="0.4" />
    </Icon>
  );
}

export function IconFocus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
    </Icon>
  );
}

export function IconMore(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconPinned(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 14 9h6l-5 4 2 6-5-3.5L7 19l2-6-5-4h6z" />
    </Icon>
  );
}

export function IconTag(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 4h7l9 9-7 7-9-9z" />
      <circle cx="8.5" cy="8.5" r="1.4" />
    </Icon>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="8" cy="17" r="2" />
    </Icon>
  );
}

export function IconNotes(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 4h14v16H5z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </Icon>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function IconSidebar(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5h16v14H4z" />
      <path d="M10 5v14" />
    </Icon>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.8-3.8" />
    </Icon>
  );
}

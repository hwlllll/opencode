import { ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => (
  <svg
    data-component="logo-mark"
    classList={{ [props.class ?? ""]: !!props.class }}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M2 2H13L22 9V17L17 22H2V2ZM7 7V17H14L17 14V11L13 7H7Z"
      fill="var(--icon-strong-base)"
    />
    <path d="M7 7H13L17 11V14L14 17H11V12L7 9V7Z" fill="var(--icon-weak-base)" />
  </svg>
)

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => (
  <svg
    ref={props.ref}
    data-component="logo-splash"
    classList={{ [props.class ?? ""]: !!props.class }}
    viewBox="0 0 80 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M10 10H45L70 30V72L52 90H10V10ZM28 30V70H44L52 62V40L40 30H28Z"
      fill="var(--icon-strong-base)"
    />
    <path d="M28 30H40L52 40V62L44 70H36V50L28 42V30Z" fill="var(--icon-base)" />
  </svg>
)

const D = () => (
  <g>
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M0 6H18L30 17V29L23 36H0V6ZM6 12V30H20L24 26V20L17 12H6Z"
      fill="var(--icon-strong-base)"
    />
    <path d="M6 12H17L24 20V26L20 30H14V21L6 16V12Z" fill="var(--icon-weak-base)" />
  </g>
)

export const Logo = (props: { class?: string }) => (
  <svg
    aria-label="Dicode"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 210 42"
    fill="none"
    classList={{ [props.class ?? ""]: !!props.class }}
  >
    <D />
    <g transform="translate(36)">
      <path d="M0 6H30V12H18V30H30V36H0V30H12V12H0V6Z" fill="var(--icon-strong-base)" />
      <rect x="12" y="12" width="6" height="8" fill="var(--icon-weak-base)" />
    </g>
    <g transform="translate(72)">
      <path d="M30 12H6V30H30V36H0V6H30V12Z" fill="var(--icon-strong-base)" />
      <rect x="6" y="12" width="9" height="6" fill="var(--icon-weak-base)" />
    </g>
    <g transform="translate(108)">
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M0 6H30V36H0V6ZM6 12V30H24V12H6Z"
        fill="var(--icon-strong-base)"
      />
      <rect x="6" y="12" width="9" height="6" fill="var(--icon-weak-base)" />
    </g>
    <g transform="translate(144)">
      <D />
    </g>
    <g transform="translate(180)">
      <path d="M0 6H30V12H6V18H25V24H6V30H30V36H0V6Z" fill="var(--icon-strong-base)" />
      <rect x="6" y="12" width="9" height="6" fill="var(--icon-weak-base)" />
    </g>
  </svg>
)

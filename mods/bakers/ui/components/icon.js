// components/icon: the mod's icons (tinted with the text color).
import { svg } from "gpui-kit";
import { icons } from "../theme.js";

/** @param {number} [size] */
export const chevron = (size = 12) => svg(icons.down).size(size).flex_none();
/** @param {number} [size] */
export const chevronRight = (size = 12) => svg(icons.right).size(size).flex_none();

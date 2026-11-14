// Placeholder for the tooling (tests, type check, lint); the bakers mod from the README replaces it.
import { div, View } from "gpui-kit";

export default class Bakers extends View {
  render() {
    return div().child("bakers.build");
  }
}

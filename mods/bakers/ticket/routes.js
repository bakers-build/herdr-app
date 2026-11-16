// ticket/routes: the ticket module's entry points. The name is what a layout block, a tab or
// an overlay passes as props().view; where Herdr shows it is noted beside each.
import ConductorPicker from "./controller/conductor-picker.js";
import Context from "./controller/context.js";
import LabelPicker from "./controller/label-picker.js";
import List from "./controller/list.js";
import Search from "./controller/search.js";
import View from "./controller/view.js";
import "./commands.js";
import "./form/confirm.js";
import "./form/create.js";

export default {
  "ticket.list": List, // tab "Tickets"
  "ticket.view": View, // tab "<ID> <state>", props.ticket
  "ticket.context": Context, // the right panel's child "ticket"
  "ticket.search": Search, // popup, cmd-shift-O
  "ticket.conductor-picker": ConductorPicker, // popup, props.ticket
  "ticket.label-picker": LabelPicker, // popup, props.ticket
};

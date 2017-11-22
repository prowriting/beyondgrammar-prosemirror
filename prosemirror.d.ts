import * as PRModel from "@types/prosemirror-model";
import * as PRState from "@types/prosemirror-state";
import * as PRView  from "@types/prosemirror-view";

declare type ExternalProseMirror = {
    view : typeof PRView;
    state : typeof PRState;
    model : typeof PRModel;
}
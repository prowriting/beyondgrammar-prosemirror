declare module TinyMCE {

    interface PluginManager {
        add(name : string, factory : PluginFactory);
    }

    interface WindowManager{
        open( windowDescriptor : any );
        alert( message : string );
    }

    interface PluginFactory {
        ( editor : Editor, url ?: string ) : any;
    }

    interface ScriptLoaderConstructor {
        new ():ScriptLoader;
    }

    interface ScriptLoader{
        add( url : string, callback ?:()=>void, scope ?: any );
        load( url : string, callback ?: ()=>void );
        loadQueue( callback : ()=>void, scope ?: any );
    }

    interface Editor extends EventDispatcher{
        settings : any;
        windowManager : WindowManager;
        nodeChanged();
        buttons : any;
        setProgressState( state : boolean, timeout ?: number ) : boolean;

        getElement() : HTMLElement;
        getBody() : HTMLElement;
        getRoot() : HTMLElement;

        addButton( name : string, settings : ButtonSettings );
    }

    interface Element {
        targetElm : HTMLElement;
    }

    interface I18n{
        add( code : string, items : any ) : void;
        translate( args : string | any[] ) : string;
    }

    interface Tools{
        extend(...args) : any;
    }

    interface LocalStorage {
        length : number;
        clear() : void;
        getItem(key : string ) : string;
        key( index : number ) : number;
        removeItem(key:string);
        setItem(key:string, value:string);
    }

    interface Static {
        PluginManager : PluginManager;
        dom : {
            ScriptLoader : ScriptLoaderConstructor;
        },

        util : {
            I18n : I18n,
            Tools : Tools,
            LocalStorage : LocalStorage
        }

        activeEditor : Editor;
    }
}

declare module TinyMCE {

    interface ControlSettings{
        border ?: string;
        classes ?: string;
        disabled ?: boolean;
        hidden ?: boolean;
        margin ?: boolean;
        minWidth ?: number;
        minHeight ?: number;
        name ?: string;
        padding ?: string;
        role ?: string;
        style ?: string;
    }

    interface WidgetSettings{
        autofocus ?: boolean;
        text ?: string;
        tooltip ?: string;
    }

    interface Event<T>{
        target : T;
    }

    interface PasteEvent extends Event<Editor>{
        content : string;
    }

    interface GetContentEvent extends Event<Editor>{
        content : string;
        format : string;
    }

    interface SetContentEvent extends Event<Editor>{
        content : string;
        format : string;
    }

    interface ButtonSettings extends ControlSettings, WidgetSettings{
        icon ?: string|boolean;
        image ?: string;
        size ?: string;
        onclick ?: ()=>void;
        onpostrender : (e : Event<Button>)=>void;
    }
}

declare module TinyMCE {
    interface EventDispatcher {
        on( name : string, callback : (e:Event<any>)=>void );
    }

    interface Button extends EventDispatcher{
        text( text : string );
        icon( iconClass : string );
    }
}


declare let tinymce : TinyMCE.Static;

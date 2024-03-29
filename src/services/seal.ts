

type MetalSealHead = [ string, number , string | null | undefined, string | null | undefined, string | undefined ];

const isMetalSealHead = (value?: any[]): value is MetalSealHead =>
    value !== undefined &&
    value[0] === MetalSeal.SCHEMA &&
    typeof(value[1]) === "number" &&
    (typeof(value[2]) === "string" || value[2] == undefined) &&
    (typeof(value[3]) === "string" || value[3] == undefined) &&
    (typeof(value[4]) === "string" || value[4] == undefined);

export class MetalSeal {
    static SCHEMA = "seal1";
    static COMPAT = [ MetalSeal.SCHEMA ];

    constructor(
        public readonly length: number,
        public readonly mimeType?: string,
        public readonly name?: string,
        public readonly comment?: string,
        public readonly schema = MetalSeal.SCHEMA,
    ) {};

    public stringify() {
        return JSON.stringify([
            // Head
            this.schema,
            this.length,
            ...(this.mimeType ? [ this.mimeType ] : this.name || this.comment ? [ null ] : []),
            ...(this.name ? [ this.name ] : this.comment ? [ null ] : []),
            ...(this.comment ? [ this.comment ] : []),
        ]);
    }

    public static parse(json: string) {
        const parsedObject = JSON.parse(json);
        if (!Array.isArray(parsedObject) ||
            !isMetalSealHead(parsedObject) ||
            !MetalSeal.COMPAT.includes(parsedObject[0])
        ) {
            throw new Error("Malformed seal JSON.");
        }
        return new MetalSeal(
            parsedObject[1],
            parsedObject[2] ?? undefined,
            parsedObject[3] ?? undefined,
            parsedObject[4] ?? undefined,
            parsedObject[0]
        );
    }
}

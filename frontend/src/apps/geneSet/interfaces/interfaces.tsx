export interface IGene {
    position: number,
    name: string | undefined,
    genome_number: number,
    sequence_number: number,
    sequence_id: number,
    homology_id?: number,

}

export class Gene implements IGene {
    private _position: number;
    private _genome_number: number;
    private _sequence_number: number;
    private _sequence_id: number;
    private _homology_id?: number;
    private _name?: string;
    private _strand?: "+" | '-';

    constructor(position:number, genome_number:number, sequence_number:number, sequence_id?:number, homology_id?:number, strand?: "+" | "-") {
        this._position = position
        this._genome_number = genome_number
        this._sequence_number = sequence_number
        this._sequence_id = sequence_id ?? sequence_number
        this._homology_id = homology_id
        this._strand = strand
    }

    public get position() {return this._position}
    public get genome_number() {return this._genome_number}
    public get sequence_number() {return this._sequence_number}
    public get sequence_id() {return this._sequence_id}
    public get homology_id() {return this._homology_id}
    public get name() {return this._name}
    public get strand() {return this._strand}

}
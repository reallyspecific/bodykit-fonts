import path from "path";
import {readdirSync as readDir, readFileSync as readFile} from "fs";
import { subset } from '@web-alchemy/fonttools';
import {stripHtml} from "string-strip-html";
import {ttfInfo} from 'ttfmeta';

import Compiler from "@reallyspecific/bodykit/compiler";

export default class extends Compiler {

	static type = 'fonts';

	flavor = 'woff2';

	include = ['*.ttf','*.woff','*.otf','*.eot','*.svg'];
	filenamePattern = null;

	clean = ['*.woff2'];

	constructor( props ) {
		super( props );
		this.filenamePattern = '[path]/[name].' + this.flavor;
		this.embeddedFontBuffer = [];
	}

	async compile( props = {} ) {

		let compiledContent = [];

		const collectContent = ( props ) => {
			const fileContents = readFile( props.in, { encoding: 'utf-8' } ).toString();
			if ( fileContents ) {
				compiledContent.push( stripHtml( fileContents ).result );
			}
		}

		if ( this.options.compileContent ) {
			let sourcePath = this.options.compileContent.source ?? this.sourceIn;
			if ( sourcePath && ! path.isAbsolute( sourcePath ) && sourcePath.startsWith('.') ) {
				sourcePath = path.join( process.cwd(), sourcePath );
			} else if ( this.options.compileContent.source ) {
				sourcePath = path.join( this.sourceIn, sourcePath );
			}

			await this.walkDirectory( {
				rootPath: sourcePath,
				in: this.options.compileContent.source ?? '',
				include: this.options.compileContent.include ?? ['*.html'],
				ignore: this.options.compileContent.ignore ?? null,
				exclude: this.options.compileContent.exclude ?? null,
				build: collectContent,
				write: false,
			} );
			if ( compiledContent.length > 0 ) {
				this.options.text = compiledContent.join(' ');
			}
		}

		await super.compile(props);
		if ( this.options.embedded ) {
			const filepath = this.out( path.dirname( this.options.embedded ), 'compiled-fonts', '.fonts.css', this.options.embedded );
			const fontBuffer = this.embeddedFontBuffer.join(' ');
			if ( ! fontBuffer ) {
				return;
			}
			await this.write( [
				{
					out: path.join( this.destOut, filepath ),
					contents: fontBuffer,
				}
			] );

		}
	}

	async build( props ) {

		const inputFileBuffer = readFile( props.in );

		let unicodes = 'U+0000-007F';
		if ( ! this.options.text ) {
			unicodes += ',U+00A0-00FF';
		}

		try {
			const outputFileBuffer = await subset( inputFileBuffer, {
				'unicodes': unicodes,
				'flavor': 'woff2',
			} );

			if ( this.options.embedded ) {
				let fontName, fontStyle, fontWeight;
				await ttfInfo(inputFileBuffer, (err, result) => {
					if (err) {
						return;
					}
					fontName = result.meta.property.find(property => property.name === 'name' || property.name === 'font-family')?.text.replaceAll(/[^A-Za-z0-9-_]/g, '') ?? fontFileName;
					fontStyle = result.meta.property.find(property => property.name === 'font-subfamily')?.text.replaceAll(/[^A-Za-z0-9-_]/g, '').toLowerCase() ?? 'normal';
					if (fontStyle === 'regular') {
						fontStyle = 'normal';
					}
					return;
				});
				if (!fontWeight) {
					fontWeight = `100 900`;
				}
				if ( fontName && fontStyle && fontWeight ) {
					const base64contents = Buffer.from(outputFileBuffer).toString('base64');
					this.embeddedFontBuffer.push(
						`@font-face {` +
						`font-family: '${fontName}';` +
						`font-style: ${fontStyle};` +
						`font-weight: ${fontWeight};` +
						`src: url('data:font/woff2;charset=utf-8;base64,${base64contents}') format('woff2');` +
						`}`
					);
				}

			}

			this.collection.add( props );
			return  [ { ...props, contents: outputFileBuffer } ];


		} catch( error ) {
			return [{
				in: props.in,
				out: props.out,
				error: {
					type: error.name,
					message: error.message,
					stack: error.stack,
				}
			}];
		}



	}

}



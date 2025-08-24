import path from "path";
import {readdirSync as readDir, readFileSync as readFile} from "fs";
import { subset } from '@web-alchemy/fonttools';
import {stripHtml} from "string-strip-html";
import {ttfInfo} from 'ttfmeta';

import {Compiler} from "@reallyspecific/bodykit/compiler";


export default class FontCompiler extends Compiler {

	fileExtension = 'woff2';
	allowedExtensions = [ '.otf', '.ttf' ];
	fileType

	constructor( props ) {
		super( props );
		this.embeddedFontBuffer = [];
	}

	async compile( props = {} ) {

		let compiledContent = '';

		let contentFiles = readDir( props.sourceIn || this.sourceIn, { recursive: true } );
		contentFiles = files.filter( file => path.extname( file ) === '.html' );
		contentFiles.forEach( file => {
			let fileContents = readFile( file );
			fileContents = stripHtml( fileContents ).result;
			compiledContent += fileContents;
		} );

		props.compiledContent = compiledContent;

		await super.compile(props);
		if ( this.buildOptions?.embedded ) {

			const fontBuffer = this.embeddedFontBuffer.join(' ');
			if ( ! fontBuffer ) {
				return;
			}
			this.write( [
				{
					filename: path.basename( 'fonts.css' ),
					contents: fontBuffer,
				}
			], path.join( this.sourceIn, path.dirname( this.buildOptions.embedded ) ) );
		}
	}

	async build( { filePath, buildOptions, compiledContent } ) {

		const inputFileBuffer = readFile(filePath);

		let unicodes = 'U+0000-007F';
		if ( ! compiledContent ) {
			unicodes += ',U+00A0-00FF';
		}

		try {
			const outputFileBuffer = await subset(inputFileBuffer, {
				'text': compiledContent ?? null,
				'unicodes': buildOptions.unicodes ?? unicodes,
				'flavor': buildOptions.outputType ?? 'woff2',
			});
			const fontFileName = path.basename(filePath, path.extname(filePath)) + '.woff2';
			const relPath = path.relative( this.sourceIn, path.dirname( filePath ) );

			const cssFileName = path.basename(filePath, path.extname(filePath)) + '.css';

			if ( buildOptions?.embedded ) {
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

			this.collection.push( {
				destPath: path.join( this.destOut, relPath, fontFileName ),
				relPath: path.join( relPath, fontFileName ),
				filePath: filePath,
				filename: fontFileName,
			} );
			const files = [ {
				destPath: path.join( this.destOut, relPath, fontFileName ),
				filePath: filePath,
				relPath: path.join( relPath, fontFileName ),
				filename: fontFileName,
				contents: outputFileBuffer
			} ];

			return files;

		} catch( error ) {
			return [{
				filePath,
				error: {
					type: error.name,
					message: error.message,
					stack: error.stack,
				}
			}];
		}



	}

}



import { IsString, Length } from 'class-validator';

/** H1 (spec 026): admite tanto una URL completa como un ID pelado — `GoogleSheetsService.extractSpreadsheetId()` normaliza. */
export class SaveGoogleSheetConfigDto {
  @IsString()
  @Length(1, 2000)
  spreadsheetId!: string;
}

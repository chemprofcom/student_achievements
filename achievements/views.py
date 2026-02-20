import pandas as pd
from django.shortcuts import render, redirect
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib import messages
from django.http import HttpResponse
from .models import Student, Event, Participation
from .forms import UploadFileForm, ReportForm
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import Table, TableStyle
from datetime import datetime
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table as RLTable, TableStyle, Spacer
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

@staff_member_required
def upload_participations(request):
    if request.method == 'POST':
        form = UploadFileForm(request.POST, request.FILES)
        if form.is_valid():
            file = request.FILES['file']
            try:
                # Читаем ВСЕ листы файла. sheet_name=None возвращает словарь {имя_листа: DataFrame}
                sheets_dict = pd.read_excel(file, sheet_name=None, header=None, engine='openpyxl')
            except Exception as e:
                messages.error(request, f'Ошибка чтения файла: {e}')
                return redirect('upload')

            # Статистика по загрузке
            total_sheets = len(sheets_dict)
            success_sheets = 0
            error_sheets = []
            total_events_created = 0
            total_participations_created = 0
            total_participations_updated = 0

            # --------------------------------------------------------
            # Внутренняя функция для обработки ОДНОГО листа
            # --------------------------------------------------------
            def process_sheet(sheet_name, df):
                nonlocal success_sheets, total_events_created, total_participations_created, total_participations_updated

                # 1. ПАРСИНГ МЕТАДАННЫХ МЕРОПРИЯТИЯ
                if len(df) < 2:
                    raise ValueError('Лист должен содержать минимум 2 строки')

                header_row = df.iloc[0]
                data_row = df.iloc[1]

                # Маппинг заголовков на колонки
                headers = {}
                for col_idx, cell in enumerate(header_row):
                    if pd.isna(cell):
                        continue
                    cell_str = str(cell).strip().lower()
                    if 'название мероприятия' in cell_str:
                        headers['name'] = col_idx
                    elif 'уровень' in cell_str:
                        headers['level'] = col_idx
                    elif 'даты проведения' in cell_str:
                        headers['dates'] = col_idx
                    elif 'впервые' in cell_str or 'организовано' in cell_str:
                        headers['first_time'] = col_idx

                # Извлечение значений
                event_name = None
                if 'name' in headers and not pd.isna(data_row[headers['name']]):
                    event_name = str(data_row[headers['name']]).strip()

                level = None
                if 'level' in headers and not pd.isna(data_row[headers['level']]):
                    level_raw = str(data_row[headers['level']]).strip().lower()
                    level_map = {
                        'факультетский': 'faculty',
                        'курсовой': 'course',
                        'университетский': 'university',
                        'межфакультетский': 'university',
                        'межуниверситетский': 'interuniversity',
                        'региональный': 'interuniversity',
                        'всероссийский': 'all_russian',
                        'межрегиональный': 'all_russian',
                        'день химика': 'chemistry_day',
                        'капустник': 'cabbage',
                        'посвящение в химики': 'dedication',
                    }
                    for rus, eng in level_map.items():
                        if rus in level_raw:
                            level = eng
                            break

                start_date = None
                end_date = None
                if 'dates' in headers and not pd.isna(data_row[headers['dates']]):
                    date_val = data_row[headers['dates']]

                    # Если это уже datetime объект
                    if hasattr(date_val, 'strftime'):
                        date_obj = date_val.date() if hasattr(date_val, 'date') else date_val
                        start_date = date_obj
                        end_date = date_obj
                    else:
                        date_str = str(date_val).strip()
                        import re
                        dates = re.findall(r'\d{1,2}\.\d{1,2}\.\d{4}', date_str)
                        if len(dates) >= 2:
                            start_date = datetime.strptime(dates[0], '%d.%m.%Y').date()
                            end_date = datetime.strptime(dates[1], '%d.%m.%Y').date()
                        elif len(dates) == 1:
                            start_date = end_date = datetime.strptime(dates[0], '%d.%m.%Y').date()
                        else:
                            # Попробуем разделить по дефису
                            if '-' in date_str:
                                parts = date_str.split('-')
                                if len(parts) == 2:
                                    start_date = datetime.strptime(parts[0].strip(), '%d.%m.%Y').date()
                                    end_date = datetime.strptime(parts[1].strip(), '%d.%m.%Y').date()

                is_first_time = False
                if 'first_time' in headers and not pd.isna(data_row[headers['first_time']]):
                    val = str(data_row[headers['first_time']]).strip().lower()
                    is_first_time = val in ['да', 'yes', '1', 'true']

                # Проверка обязательных полей
                if not event_name:
                    raise ValueError('Не найдено название мероприятия')
                if not level:
                    raise ValueError('Не определён уровень мероприятия')
                if not start_date or not end_date:
                    raise ValueError('Не определены даты проведения')

                # 2. ПОИСК ТАБЛИЦЫ УЧАСТНИКОВ
                start_row = None
                for idx, row in df.iterrows():
                    cell0 = str(row[0]) if not pd.isna(row[0]) else ""
                    if "ФИО" in cell0:
                        start_row = idx + 1
                        break

                if start_row is None:
                    raise ValueError('Не найдена таблица с участниками (нет колонки "ФИО")')

                # 3. СОЗДАНИЕ/ОБНОВЛЕНИЕ МЕРОПРИЯТИЯ
                event, created = Event.objects.update_or_create(
                    name=event_name,
                    start_date=start_date,
                    end_date=end_date,
                    defaults={
                        'level': level,
                        'is_first_time': is_first_time,
                    }
                )
                if created:
                    total_events_created += 1

                # 4. ОБРАБОТКА УЧАСТНИКОВ
                created_count = 0
                updated_count = 0
                for i in range(start_row, len(df)):
                    row = df.iloc[i]
                    if pd.isna(row[0]) or str(row[0]).strip() == '':
                        continue

                    full_name = str(row[0]).strip()
                    group = str(row[1]).strip() if len(row) > 1 and not pd.isna(row[1]) else ''
                    role = str(row[2]).strip() if len(row) > 2 and not pd.isna(row[2]) else ''
                    
                    hours_str = str(row[3]).strip() if len(row) > 3 and not pd.isna(row[3]) else '0'
                    # Извлекаем только цифры из строки (отбрасываем +, пробелы, текст)
                    import re
                    digits = re.sub(r'[^\d]', '', hours_str)  # оставляем только цифры
                    try:
                        hours = int(digits) if digits else 0
                    except:
                        hours = 0
                    
                    if hours <= 0:
                        continue

                    student, _ = Student.objects.get_or_create(
                        full_name=full_name,
                        defaults={'group': group}
                    )
                    if student.group != group:
                        student.group = group
                        student.save()

                    part, created_part = Participation.objects.update_or_create(
                        student=student,
                        event=event,
                        defaults={'role': role, 'hours': hours}
                    )
                    if created_part:
                        created_count += 1
                    else:
                        updated_count += 1

                total_participations_created += created_count
                total_participations_updated += updated_count
                success_sheets += 1
                return f'Лист "{sheet_name}": {event_name} — добавлено {created_count}, обновлено {updated_count}'

            # --------------------------------------------------------
            # Цикл по всем листам
            # --------------------------------------------------------
            sheet_results = []
            for sheet_name, df in sheets_dict.items():
                try:
                    result_msg = process_sheet(sheet_name, df)
                    sheet_results.append(result_msg)
                except Exception as e:
                    error_sheets.append(f'{sheet_name}: {str(e)}')
                    continue  # переходим к следующему листу

            # Формируем итоговое сообщение
            if success_sheets > 0:
                messages.success(
                    request,
                    f'✅ Успешно обработано листов: {success_sheets} из {total_sheets}\n'
                    f'📊 Создано мероприятий: {total_events_created}\n'
                    f'👥 Добавлено участий: {total_participations_created}, обновлено: {total_participations_updated}\n\n'
                    + '\n'.join(sheet_results[:5])  # покажем первые 5
                )
            if error_sheets:
                messages.error(
                    request,
                    f'❌ Ошибки на листах:\n' + '\n'.join(error_sheets[:5])
                )

            return redirect('upload')
    else:
        form = UploadFileForm()

    return render(request, 'achievements/upload.html', {'form': form})

from django.conf import settings
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import Table as RLTable, TableStyle
from reportlab.platypus import Paragraph, Spacer
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os
from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import render, redirect
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib import messages
from .models import Student, Event, Participation
from .forms import ReportForm
from datetime import datetime

@staff_member_required
def student_report(request):
    # ----- РЕГИСТРАЦИЯ ШРИФТА (кириллица) -----
    font_name = 'Helvetica'  # fallback
    font_path = os.path.join(settings.BASE_DIR, 'fonts', 'DejaVuSans.ttf')
    if os.path.exists(font_path):
        pdfmetrics.registerFont(TTFont('DejaVuSans', font_path))
        font_name = 'DejaVuSans'
    else:
        win_font = "C:\\Windows\\Fonts\\arial.ttf"
        if os.path.exists(win_font):
            pdfmetrics.registerFont(TTFont('Arial', win_font))
            font_name = 'Arial'
    # -------------------------------------------

    if request.method == 'POST':
        form = ReportForm(request.POST)
        if form.is_valid():
            student = form.cleaned_data['student']
            date_from = form.cleaned_data['date_from']
            date_to = form.cleaned_data['date_to']

            participations = Participation.objects.filter(
                student=student,
                event__start_date__range=[date_from, date_to]
            ).order_by('event__start_date')

            response = HttpResponse(content_type='application/pdf')
            filename = f"report_{student.id}_{date_from}_{date_to}.pdf"
            response['Content-Disposition'] = f'attachment; filename="{filename}"'

            # Создаём PDF через canvas (проще и надёжнее для заголовков)
            p = canvas.Canvas(response, pagesize=A4)
            width, height = A4

            # ----- ЗАГОЛОВОК (на canvas) -----
            p.setFont(font_name, 16)
            p.drawString(20*mm, height-20*mm, f"Отчёт по студенту: {student.full_name}")
            p.setFont(font_name, 12)
            p.drawString(20*mm, height-30*mm, f"Период: {date_from.strftime('%d.%m.%Y')} - {date_to.strftime('%d.%m.%Y')}")

            # ----- ПОДГОТОВКА ДАННЫХ ДЛЯ ТАБЛИЦЫ -----
            # Используем Paragraph для автоматического переноса и увеличения высоты строк
            style_normal = ParagraphStyle(
                name='Normal',
                fontName=font_name,
                fontSize=9,
                leading=13,
                alignment=TA_LEFT,
                wordWrap='CJK',          # переносит любые символы
            )
            style_center = ParagraphStyle(
                name='Center',
                fontName=font_name,
                fontSize=9,
                leading=13,
                alignment=TA_CENTER,
                wordWrap='CJK',
            )
            style_right = ParagraphStyle(
                name='Right',
                fontName=font_name,
                fontSize=9,
                leading=13,
                alignment=TA_RIGHT,
                wordWrap='CJK',
            )
            style_header = ParagraphStyle(
                name='Header',
                fontName=font_name,
                fontSize=9,
                leading=13,
                alignment=TA_CENTER,
                textColor=colors.whitesmoke,
                wordWrap='CJK',
            )

            data = []
            # Заголовок таблицы
            data.append([
                Paragraph("Начало", style_header),
                Paragraph("Конец", style_header),
                Paragraph("Мероприятие", style_header),
                Paragraph("Уровень", style_header),
                Paragraph("Роль", style_header),
                Paragraph("Часы", style_header),
            ])

            total_hours = 0
            for part in participations:
                # Обработка роли (добавляем пробелы для лучшего переноса)
                role = part.role.strip()
                # Корректируем слипшиеся слова
                role = role.replace("главныйорганизатор", "главный организатор")
                role = role.replace("главныйорган", "главный организатор")
                role = role.replace("организатор(отв.", "организатор (отв.")
                role = role.replace("отв.за", "отв. за")
                role = role.replace("отдельныйблок", "отдельный блок")
                role = role.replace("тех.части", "тех. части")
                role = role.replace("и.т.п.", "и т.п.")
                # Вставляем пробелы после точек, если их нет
                import re
                role = re.sub(r'\.([а-яa-z])', r'. \1', role, flags=re.IGNORECASE)
                role = ' '.join(role.split())

                # Формируем строку таблицы
                row = [
                    Paragraph(part.event.start_date.strftime("%d.%m.%Y"), style_center),
                    Paragraph(part.event.end_date.strftime("%d.%m.%Y"), style_center),
                    Paragraph(part.event.name, style_normal),
                    Paragraph(part.event.get_level_display(), style_normal),
                    Paragraph(role, style_normal),
                    Paragraph(str(part.hours), style_center),
                ]
                data.append(row)
                total_hours += part.hours

            # Итоговая строка
            data.append([
                Paragraph("", style_normal),
                Paragraph("", style_normal),
                Paragraph("", style_normal),
                Paragraph("", style_normal),
                Paragraph("ИТОГО часов:", style_right),
                Paragraph(str(total_hours), style_center),
            ])

            # ----- ШИРИНА КОЛОНОК (оптимизировано под A4) -----
            col_widths = [
                25*mm,   # Начало
                25*mm,   # Конец
                50*mm,   # Мероприятие (УВЕЛИЧЕНО)
                30*mm,   # Уровень     (УВЕЛИЧЕНО)
                50*mm,   # Роль        (УМЕНЬШЕНО, но с переносом)
                15*mm,   # Часы
            ]

            table = RLTable(data, colWidths=col_widths, repeatRows=1)

            # ----- СТИЛЬ ТАБЛИЦЫ -----
            style_table = TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.grey),
                ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
                ('ALIGN', (0,0), (-1,0), 'CENTER'),
                ('VALIGN', (0,0), (-1,0), 'MIDDLE'),
                ('GRID', (0,0), (-1,-1), 0.5, colors.black),   # сетка для всех ячеек
                ('BACKGROUND', (0,-1), (-1,-1), colors.lightgrey),
                ('ALIGN', (4,-1), (4,-1), 'RIGHT'),
                ('ALIGN', (5,-1), (5,-1), 'CENTER'),
                ('VALIGN', (0,0), (-1,-1), 'TOP'),            # прижимаем текст вверх
                ('LEFTPADDING', (0,0), (-1,-1), 3),
                ('RIGHTPADDING', (0,0), (-1,-1), 3),
                ('TOPPADDING', (0,0), (-1,-1), 2),
                ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ])
            table.setStyle(style_table)

            # ----- РАЗМЕЩЕНИЕ ТАБЛИЦЫ НА СТРАНИЦЕ -----
            table_width, table_height = table.wrap(0, 0)   # вычисляем реальную высоту
            x = (width - table_width) / 2   # центрируем
            y = height - 45*mm - table_height
            if y < 15*mm:
                p.showPage()
                y = height - 25*mm - table_height
            table.drawOn(p, x, y)

            p.showPage()
            p.save()
            return response
    else:
        form = ReportForm()

    return render(request, 'achievements/report_form.html', {'form': form})
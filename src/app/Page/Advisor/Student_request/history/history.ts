import { Component, signal, computed, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, forkJoin, of } from 'rxjs';
import { AuthService } from '../../../../auth.service';
import { Constants } from '../../../../comfig/constants';
import { T3HistoryAdvisor, Item as T3Item } from '../../../../model/res/t3_history_advisor';
import { PreT3HistoryAdvisor, Item as PreT3Item } from '../../../../model/res/pre-t3_history_advisor';

type FilterType = 'all' | 'approved' | 'rejected';
type AdvisorStatus = 'Approved' | 'Rejected' | 'Pending';

interface HistoryCard {
  id:             string;
  itemType:       'T3' | 'PreT3';
  studentName:    string;
  studentId:      string;
  articleTitle:   string;
  journalName:    string;
  issn:           string;
  database:       string;
  quartile:       string;
  pubType:        string;
  isDiscontinued: boolean;
  submittedDate:  string;
  advisorStatus:  AdvisorStatus;
  actionDate:     string | null;
  updatedAt:      Date;
}

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class History implements OnInit {
  private http      = inject(HttpClient);
  private auth      = inject(AuthService);
  private constants = inject(Constants);

  private readonly THAI_MONTHS = [
    'ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
    'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.',
  ];

  isLoading    = signal(true);
  activeFilter = signal<FilterType>('all');
  allCards     = signal<HistoryCard[]>([]);

  filtered = computed(() => {
    const f   = this.activeFilter();
    const all = this.allCards();
    if (f === 'approved') return all.filter(c => c.advisorStatus === 'Approved');
    if (f === 'rejected')  return all.filter(c => c.advisorStatus === 'Rejected');
    return all;
  });

  get countAll():      number { return this.allCards().length; }
  get countApproved(): number { return this.allCards().filter(c => c.advisorStatus === 'Approved').length; }
  get countRejected(): number { return this.allCards().filter(c => c.advisorStatus === 'Rejected').length; }

  setFilter(f: FilterType): void { this.activeFilter.set(f); }

  ngOnInit(): void {
    const headers = new HttpHeaders({ Authorization: `Bearer ${this.auth.token}` });
    const t3$    = this.http.get<T3HistoryAdvisor>(`${this.constants.API_ENDPOINT}/t3/history?page=1&limit=20`, { headers })
                       .pipe(catchError(() => of(null)));
    const preT3$ = this.http.get<PreT3HistoryAdvisor>(`${this.constants.API_ENDPOINT}/pre-t3/history?page=1&limit=20`, { headers })
                       .pipe(catchError(() => of(null)));

    forkJoin([t3$, preT3$]).subscribe(([t3Res, preT3Res]) => {
      const t3Cards    = (t3Res?.success    ? t3Res.data.items    : []).map(d => this.mapT3(d));
      const preT3Cards = (preT3Res?.success ? preT3Res.data.items : []).map(d => this.mapPreT3(d));

      const merged = [...t3Cards, ...preT3Cards]
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

      this.allCards.set(merged);
      this.isLoading.set(false);
    });
  }

  private mapT3(d: T3Item): HistoryCard {
    const advStatus = d.advisor_approval.status as string;
    const advisorStatus: AdvisorStatus =
      advStatus === 'Approved' ? 'Approved' :
      advStatus === 'Rejected' ? 'Rejected' : 'Pending';

    return {
      id:            `T3-${d.t3_id}`,
      itemType:      'T3',
      studentName:   d.student_name,
      studentId:     d.student_email.replace('@msu.ac.th', ''),
      articleTitle:  d.paper_and_research_details.title_thai || d.paper_and_research_details.title_english,
      journalName:   d.journal_snapshot.journal_name,
      issn:          d.issn || d.journal_snapshot.issn,
      database:      d.publication_details.specified_database,
      quartile:      '',
      pubType:       d.publication_details.type,
      isDiscontinued: false,
      submittedDate: this.formatDate(d.created_at),
      advisorStatus,
      actionDate:    d.advisor_approval.approved_at ? this.formatDate(d.advisor_approval.approved_at) : null,
      updatedAt:     new Date(d.updated_at as unknown as string),
    };
  }

  private mapPreT3(d: PreT3Item): HistoryCard {
    const advStatus = d.advisor_approval.status as unknown as string;
    const advisorStatus: AdvisorStatus =
      advStatus === 'Approved' ? 'Approved' :
      advStatus === 'Rejected' ? 'Rejected' : 'Pending';

    const titleEn = (d.article_info?.title_en as unknown as string | null);
    const titleTh = (d.article_info?.title_th as unknown as string | null);
    const articleTitle = titleEn || titleTh || d.journal_snapshot.journal_name;

    return {
      id:            `PRE-T3-${d.pre_t3_id}`,
      itemType:      'PreT3',
      studentName:   d.student_name,
      studentId:     d.student_email.replace('@msu.ac.th', ''),
      articleTitle,
      journalName:   d.journal_snapshot.journal_name,
      issn:          d.journal_snapshot.issn,
      database:      d.journal_snapshot.indexed_database,
      quartile:      d.journal_snapshot.quartile_or_tier ?? '',
      pubType:       '',
      isDiscontinued: d.journal_snapshot.is_discontinued,
      submittedDate: this.formatDate(d.created_at),
      advisorStatus,
      actionDate:    d.advisor_approval.approved_at ? this.formatDate(d.advisor_approval.approved_at) : null,
      updatedAt:     new Date(d.updated_at as unknown as string),
    };
  }

  private formatDate(date: Date | string | null): string {
    if (!date) return '-';
    const d = new Date(date as string);
    if (isNaN(d.getTime())) return '-';
    const year = (d.getFullYear() + 543).toString().slice(-2);
    return `${d.getDate()} ${this.THAI_MONTHS[d.getMonth()]} ${year}`;
  }

  cardIconClass(card: HistoryCard): string {
    if (card.advisorStatus === 'Approved') return 'card-icon card-icon--approved';
    if (card.advisorStatus === 'Rejected') return 'card-icon card-icon--rejected';
    return 'card-icon card-icon--pending';
  }

  statusBadgeClass(card: HistoryCard): string {
    if (card.advisorStatus === 'Approved') return 'status-badge status-approved';
    if (card.advisorStatus === 'Rejected') return 'status-badge status-rejected';
    return 'status-badge status-pending';
  }

  statusLabel(card: HistoryCard): string {
    if (card.advisorStatus === 'Approved') return '✅ อนุมัติแล้ว';
    if (card.advisorStatus === 'Rejected') return '❌ ไม่อนุมัติ';
    return '⏳ รอดำเนินการ';
  }

  actionDateLabel(card: HistoryCard): string {
    if (!card.actionDate) return '';
    if (card.advisorStatus === 'Approved') return `อนุมัติ ${card.actionDate}`;
    if (card.advisorStatus === 'Rejected') return `ปฏิเสธ ${card.actionDate}`;
    return '';
  }
}

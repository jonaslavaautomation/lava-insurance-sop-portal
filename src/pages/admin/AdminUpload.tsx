import { useNavigate } from 'react-router-dom';
import { SopSubmissionForm } from '@/components/SopSubmissionForm';

export default function AdminUpload() {
  const navigate = useNavigate();

  return (
    <div className="p-8 max-w-3xl">
      <SopSubmissionForm
        heading="Upload SOP Document"
        description="Upload a PDF, Word document, or plain text file — the text is extracted automatically and normalized to the same format VAs see for every SOP, no matter what it was uploaded as."
        submitLabel="Upload SOP"
        cancelLabel="Cancel"
        onCancel={() => navigate('/admin/library')}
        onSuccess={() => navigate('/admin/review')}
        renderNoCompanies={(sourceType) => (
          <p>
            {sourceType === 'ams'
              ? <>No AMS platforms yet — add one on the <a href="/admin/ams" className="underline hover:text-amber-300">AMS</a> page first.</>
              : <>No insurance companies yet — add one on the <a href="/admin/companies" className="underline hover:text-amber-300">Insurance Companies</a> page first.</>}
          </p>
        )}
      />
    </div>
  );
}

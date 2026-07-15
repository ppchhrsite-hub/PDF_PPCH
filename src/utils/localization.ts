export type Locale = 'en' | 'th';

export interface Translations {
  app: {
    name: string;
    description: string;
  };
  common: {
    cancel: string;
    confirm: string;
    apply: string;
    close: string;
    save: string;
    export: string;
    settings: string;
    page: string;
    pages: string;
    add: string;
    delete: string;
    loading: string;
  };
  tabs: {
    home: string;
    toolkit: string;
    edit: string;
    comment: string;
    security: string;
  };
  workspace: {
    noDocuments: string;
    dragDrop: string;
    chooseFile: string;
    privacyNotice: string;
    pagesPanel: string;
    bookmarksPanel: string;
    inspectorPanel: string;
  };
  toolkit: {
    merge: {
      title: string;
      desc: string;
      btn: string;
    };
    split: {
      title: string;
      desc: string;
      btn: string;
    };
    crop: {
      title: string;
      desc: string;
      btn: string;
    };
    rotate: {
      title: string;
      desc: string;
      btn: string;
    };
    deletePages: {
      title: string;
      desc: string;
      btn: string;
    };
    blankPage: {
      title: string;
      desc: string;
      btn: string;
    };
  };
  inspector: {
    properties: string;
    color: string;
    fillColor: string;
    fontSize: string;
    strokeWidth: string;
    opacity: string;
    text: string;
    none: string;
  };
  security: {
    encrypt: string;
    decrypt: string;
    password: string;
    confirmPassword: string;
  };
}

export const translations: Record<Locale, Translations> = {
  en: {
    app: {
      name: 'Lyncub PDF Workbench',
      description: 'Fast, secure, and modern client-side PDF editor.',
    },
    common: {
      cancel: 'Cancel',
      confirm: 'Confirm',
      apply: 'Apply',
      close: 'Close',
      save: 'Save PDF',
      export: 'Export',
      settings: 'Settings',
      page: 'Page',
      pages: 'Pages',
      add: 'Add',
      delete: 'Delete',
      loading: 'Loading...',
    },
    tabs: {
      home: 'Home',
      toolkit: 'Toolkit',
      edit: 'Edit Text',
      comment: 'Comment & Draw',
      security: 'Security',
    },
    workspace: {
      noDocuments: 'No documents open',
      dragDrop: 'Drag & drop PDF files here, or click to browse',
      chooseFile: 'Choose PDF file',
      privacyNotice: '100% Private & Secure: Your files are processed entirely locally on your device. We do not upload your data to any server.',
      pagesPanel: 'Pages',
      bookmarksPanel: 'Bookmarks',
      inspectorPanel: 'Properties Inspector',
    },
    toolkit: {
      merge: {
        title: 'Merge PDF',
        desc: 'Combine multiple PDF files or page ranges into one document.',
        btn: 'Merge Files',
      },
      split: {
        title: 'Split PDF',
        desc: 'Split a PDF document by ranges or extract individual pages.',
        btn: 'Split PDF',
      },
      crop: {
        title: 'Crop PDF',
        desc: 'Trim margins or set crop boxes for specific page ranges.',
        btn: 'Crop PDF',
      },
      rotate: {
        title: 'Rotate PDF',
        desc: 'Rotate selected pages or all pages 90 degrees left or right.',
        btn: 'Rotate Pages',
      },
      deletePages: {
        title: 'Delete Pages',
        desc: 'Remove unwanted pages from the document.',
        btn: 'Delete Pages',
      },
      blankPage: {
        title: 'Add Blank Page',
        desc: 'Insert a blank page at a specific position.',
        btn: 'Insert Page',
      },
    },
    inspector: {
      properties: 'Properties',
      color: 'Stroke Color',
      fillColor: 'Fill Color',
      fontSize: 'Font Size',
      strokeWidth: 'Line Width',
      opacity: 'Opacity',
      text: 'Text Content',
      none: 'No element selected',
    },
    security: {
      encrypt: 'Encrypt with Password',
      decrypt: 'Remove Protection',
      password: 'Password',
      confirmPassword: 'Confirm Password',
    },
  },
  th: {
    app: {
      name: 'Lyncub PDF Workbench',
      description: 'โปรแกรมแก้ไข PDF ฝั่งไคลเอนต์ที่รวดเร็ว ปลอดภัย และทันสมัย',
    },
    common: {
      cancel: 'ยกเลิก',
      confirm: 'ยืนยัน',
      apply: 'ใช้',
      close: 'ปิด',
      save: 'บันทึก PDF',
      export: 'ส่งออก',
      settings: 'การตั้งค่า',
      page: 'หน้า',
      pages: 'หน้า',
      add: 'เพิ่ม',
      delete: 'ลบ',
      loading: 'กำลังโหลด...',
    },
    tabs: {
      home: 'หน้าหลัก',
      toolkit: 'ชุดเครื่องมือ',
      edit: 'แก้ไขข้อความ',
      comment: 'คำอธิบายและวาด',
      security: 'ความปลอดภัย',
    },
    workspace: {
      noDocuments: 'ยังไม่มีเอกสารเปิดอยู่',
      dragDrop: 'ลากและวางไฟล์ PDF ที่นี่ หรือคลิกเพื่อเลือกไฟล์',
      chooseFile: 'เลือกไฟล์ PDF',
      privacyNotice: 'ส่วนตัวและปลอดภัย 100%: ไฟล์ของคุณจะถูกประมวลผลบนอุปกรณ์ของคุณเท่านั้น เราไม่อัปโหลดข้อมูลของคุณไปยังเซิร์ฟเวอร์ใดๆ',
      pagesPanel: 'รูปย่อหน้า',
      bookmarksPanel: 'บุ๊กมาร์ก',
      inspectorPanel: 'ตัวตรวจสอบคุณสมบัติ',
    },
    toolkit: {
      merge: {
        title: 'รวม PDF',
        desc: 'รวมไฟล์ PDF หลายไฟล์หรือช่วงหน้าเข้าด้วยกันเป็นไฟล์เดียว',
        btn: 'รวมไฟล์',
      },
      split: {
        title: 'แยก PDF',
        desc: 'แยกเอกสาร PDF ตามช่วงหน้า หรือดึงหน้าเอกสารที่ต้องการออกมา',
        btn: 'แยกหน้า PDF',
      },
      crop: {
        title: 'ครอบตัด PDF',
        desc: 'ตัดขอบหรือตั้งค่า CropBox สำหรับช่วงหน้าเอกสารที่กำหนด',
        btn: 'ครอบตัด PDF',
      },
      rotate: {
        title: 'หมุน PDF',
        desc: 'หมุนหน้าเอกสารที่เลือกหรือทุกหน้า 90 องศาไปทางซ้ายหรือขวา',
        btn: 'หมุนหน้าเอกสาร',
      },
      deletePages: {
        title: 'ลบหน้า PDF',
        desc: 'ลบหน้าเอกสารที่ไม่ต้องการออกจากไฟล์',
        btn: 'ลบหน้าเอกสาร',
      },
      blankPage: {
        title: 'เพิ่มหน้าว่าง',
        desc: 'แทรกหน้ากระดาษเปล่าลงในตำแหน่งที่ระบุ',
        btn: 'แทรกหน้าว่าง',
      },
    },
    inspector: {
      properties: 'คุณสมบัติ',
      color: 'สีเส้นขอบ',
      fillColor: 'สีพื้นหลัง',
      fontSize: 'ขนาดตัวอักษร',
      strokeWidth: 'ความกว้างของเส้น',
      opacity: 'ความโปร่งแสง',
      text: 'เนื้อหาข้อความ',
      none: 'ไม่ได้เลือกองค์ประกอบใดๆ',
    },
    security: {
      encrypt: 'ป้องกันด้วยรหัสผ่าน',
      decrypt: 'เอาการป้องกันออก',
      password: 'รหัสผ่าน',
      confirmPassword: 'ยืนยันรหัสผ่าน',
    },
  },
};

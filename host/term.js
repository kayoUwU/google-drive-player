const LegalContentType = {
  TERMS: "TERMS",
  PRIVACY: "PRIVACY",
}

const legalContent = {
  [LegalContentType.TERMS]: {
    title: "Terms and Conditions",
    content: `This website was created as a personal project. We provide no guarantees regarding service uptime and connection to User's Google Drive.
Google Drive is a trademark of Google Company. The website are original works build with Google API and are not affiliated with, endorsed by, or representative of Google Company or any other trademarked entities.`,
  },
  [LegalContentType.PRIVACY]: {
    title: "Privacy Policy",
    content: `Google Authorization is required to allow this application gaining access to Google API utilization. We do not store personal data in our server. All audio and playlist are stored in User's browser and drive. To get audio from User's drive, user selects audio directly from Google Picker API and load to User's browser. All the audio are not transimmit through our server. Standard server logs may be kept by our hosting provider for security purposes.`,
  }
};

const content = document.getElementById("terms");
const year = document.getElementById("year");

function init() {
  year.innerHTML = new Date().getFullYear();

  {
    Object.values(LegalContentType)
      .map((index) => {
        const button = document.createElement("button");
        button.className = "link_button";
        button.onclick = () => alert(legalContent[index].content);
        button.innerHTML = `${legalContent[index].title}`;
        content.appendChild(button);
      })
  }
}
init();